from __future__ import annotations

import re
import struct
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any


class DexFormatError(ValueError):
    """Raised when a DEX file has an invalid or unsupported structure."""


MAX_DEX_FILES = 32
MAX_DEX_TOTAL_BYTES = 256 * 1024 * 1024
MAX_TABLE_ITEMS = 1_000_000
MAX_CLASS_DEFINITIONS = 300_000

# These signatures identify likely third-party libraries. A match is evidence,
# not proof of a specific version; versions are deliberately not inferred.
LIBRARY_SIGNATURES = (
    ("okhttp3.", "OkHttp", "Networking"),
    ("com.squareup.okhttp.", "OkHttp 2", "Networking"),
    ("retrofit2.", "Retrofit", "Networking"),
    ("okio.", "Okio", "Networking"),
    ("com.google.gson.", "Gson", "Serialization"),
    ("com.squareup.moshi.", "Moshi", "Serialization"),
    ("com.fasterxml.jackson.", "Jackson", "Serialization"),
    ("androidx.lifecycle.", "AndroidX Lifecycle", "AndroidX"),
    ("androidx.recyclerview.", "AndroidX RecyclerView", "AndroidX"),
    ("androidx.room.", "AndroidX Room", "Database"),
    ("androidx.navigation.", "AndroidX Navigation", "AndroidX"),
    ("androidx.compose.", "Jetpack Compose", "UI"),
    ("com.google.firebase.", "Firebase", "Backend"),
    ("com.google.android.gms.", "Google Play Services", "Platform"),
    ("com.facebook.react.", "React Native", "Framework"),
    ("com.facebook.hermes.", "Hermes", "Framework"),
    ("io.flutter.", "Flutter", "Framework"),
    ("com.bumptech.glide.", "Glide", "Media"),
    ("com.squareup.picasso.", "Picasso", "Media"),
    ("org.greenrobot.eventbus.", "EventBus", "Utility"),
    ("io.reactivex.", "RxJava", "Reactive"),
    ("io.reactivex.rxjava3.", "RxJava 3", "Reactive"),
    ("kotlinx.coroutines.", "Kotlin Coroutines", "Concurrency"),
    ("dagger.", "Dagger", "Dependency Injection"),
    ("javax.inject.", "Javax Inject", "Dependency Injection"),
)


def _require_range(data: bytes, offset: int, size: int, label: str) -> None:
    if offset < 0 or size < 0 or offset + size > len(data):
        raise DexFormatError(f"Bagian {label} berada di luar batas file DEX.")


def _read_uleb128(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0
    for _ in range(5):
        if offset >= len(data):
            raise DexFormatError("ULEB128 terpotong.")
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if (byte & 0x80) == 0:
            return value, offset
        shift += 7
    raise DexFormatError("ULEB128 terlalu panjang.")


def _read_dex_string(data: bytes, offset: int) -> str:
    # The first ULEB128 value is the UTF-16 length. Names used by the detector
    # are identifiers, so UTF-8 replacement is safer than failing on MUTF-8.
    _, cursor = _read_uleb128(data, offset)
    end = data.find(b"\x00", cursor)
    if end < 0:
        raise DexFormatError("String DEX tidak memiliki terminator.")
    raw = data[cursor:end].replace(b"\xC0\x80", b"\x00")
    return raw.decode("utf-8", errors="replace")


def _validate_table(
    data: bytes,
    count: int,
    offset: int,
    item_size: int,
    label: str,
) -> None:
    if count > MAX_TABLE_ITEMS:
        raise DexFormatError(f"Jumlah item {label} melebihi batas aman.")
    if count == 0:
        return
    if offset == 0:
        raise DexFormatError(f"Offset tabel {label} tidak tersedia.")
    _require_range(data, offset, count * item_size, label)


def _descriptor_to_names(descriptor: str) -> tuple[str, str] | None:
    if not descriptor.startswith("L") or not descriptor.endswith(";"):
        return None
    internal_name = descriptor[1:-1]
    if not internal_name or internal_name.startswith("/"):
        return None
    class_name = internal_name.replace("/", ".")
    package_name = class_name.rpartition(".")[0]
    return class_name, package_name


def _parse_dex(data: bytes, dex_filename: str) -> list[dict[str, Any]]:
    if len(data) < 112 or not data.startswith(b"dex\n") or data[7] != 0:
        raise DexFormatError("Header DEX tidak valid atau format belum didukung.")

    file_size = struct.unpack_from("<I", data, 32)[0]
    header_size = struct.unpack_from("<I", data, 36)[0]
    endian_tag = struct.unpack_from("<I", data, 40)[0]
    if file_size < 112 or file_size > len(data) or header_size != 112:
        raise DexFormatError("Ukuran atau versi header DEX tidak valid.")
    if endian_tag != 0x12345678:
        raise DexFormatError("Urutan byte DEX tidak didukung.")

    string_count, string_offset = struct.unpack_from("<II", data, 56)
    type_count, type_offset = struct.unpack_from("<II", data, 64)
    proto_count, proto_offset = struct.unpack_from("<II", data, 72)
    method_count, method_offset = struct.unpack_from("<II", data, 88)
    class_count, class_offset = struct.unpack_from("<II", data, 96)

    if class_count > MAX_CLASS_DEFINITIONS:
        raise DexFormatError("Jumlah class definition melebihi batas aman.")

    _validate_table(data, string_count, string_offset, 4, "string_ids")
    _validate_table(data, type_count, type_offset, 4, "type_ids")
    _validate_table(data, proto_count, proto_offset, 12, "proto_ids")
    _validate_table(data, method_count, method_offset, 8, "method_ids")
    _validate_table(data, class_count, class_offset, 32, "class_defs")

    strings: list[str] = []
    for index in range(string_count):
        string_data_offset = struct.unpack_from(
            "<I", data, string_offset + (index * 4)
        )[0]
        _require_range(data, string_data_offset, 1, "string_data")
        strings.append(_read_dex_string(data, string_data_offset))

    type_descriptors: list[str] = []
    for index in range(type_count):
        descriptor_index = struct.unpack_from(
            "<I", data, type_offset + (index * 4)
        )[0]
        if descriptor_index >= len(strings):
            raise DexFormatError("Indeks descriptor type_id tidak valid.")
        type_descriptors.append(strings[descriptor_index])

    protos: list[tuple[int, int]] = []
    for index in range(proto_count):
        item_offset = proto_offset + (index * 12)
        return_type_index = struct.unpack_from("<I", data, item_offset + 4)[0]
        parameters_offset = struct.unpack_from("<I", data, item_offset + 8)[0]
        if return_type_index >= len(type_descriptors):
            raise DexFormatError("Return type pada proto_id tidak valid.")
        protos.append((return_type_index, parameters_offset))

    method_ids: list[tuple[int, int, int]] = []
    for index in range(method_count):
        item_offset = method_offset + (index * 8)
        class_index, proto_index, name_index = struct.unpack_from(
            "<HHI", data, item_offset
        )
        if (
            class_index >= len(type_descriptors)
            or proto_index >= len(protos)
            or name_index >= len(strings)
        ):
            raise DexFormatError("Referensi method_id tidak valid.")
        method_ids.append((class_index, proto_index, name_index))

    def method_signature(proto_index: int) -> str:
        return_type_index, parameters_offset = protos[proto_index]
        parameter_descriptors: list[str] = []
        if parameters_offset:
            _require_range(data, parameters_offset, 4, "type_list")
            parameter_count = struct.unpack_from(
                "<I", data, parameters_offset
            )[0]
            if parameter_count > MAX_TABLE_ITEMS:
                raise DexFormatError("Jumlah parameter method terlalu besar.")
            _require_range(
                data, parameters_offset + 4, parameter_count * 2, "type_list"
            )
            for parameter_index in range(parameter_count):
                type_index = struct.unpack_from(
                    "<H", data, parameters_offset + 4 + (parameter_index * 2)
                )[0]
                if type_index >= len(type_descriptors):
                    raise DexFormatError("Parameter method memiliki type_id invalid.")
                parameter_descriptors.append(type_descriptors[type_index])
        return (
            "("
            + "".join(parameter_descriptors)
            + ")"
            + type_descriptors[return_type_index]
        )

    def read_class_methods(class_data_offset: int, class_index: int) -> list[dict[str, Any]]:
        if class_data_offset == 0:
            return []
        _require_range(data, class_data_offset, 1, "class_data")
        cursor = class_data_offset
        static_fields, cursor = _read_uleb128(data, cursor)
        instance_fields, cursor = _read_uleb128(data, cursor)
        direct_methods, cursor = _read_uleb128(data, cursor)
        virtual_methods, cursor = _read_uleb128(data, cursor)

        field_total = static_fields + instance_fields
        method_total = direct_methods + virtual_methods
        if field_total > MAX_TABLE_ITEMS or method_total > MAX_TABLE_ITEMS:
            raise DexFormatError("Data class melebihi batas aman.")

        for _ in range(field_total):
            _, cursor = _read_uleb128(data, cursor)
            _, cursor = _read_uleb128(data, cursor)

        parsed_methods: list[dict[str, Any]] = []
        for kind, count in (("direct", direct_methods), ("virtual", virtual_methods)):
            method_index = 0
            for _ in range(count):
                index_diff, cursor = _read_uleb128(data, cursor)
                method_index += index_diff
                access_flags, cursor = _read_uleb128(data, cursor)
                _, cursor = _read_uleb128(data, cursor)  # code_off
                if method_index >= len(method_ids):
                    raise DexFormatError("Indeks method class_data tidak valid.")
                method_class_index, proto_index, name_index = method_ids[method_index]
                if method_class_index != class_index:
                    raise DexFormatError("Method tidak cocok dengan class pemiliknya.")
                parsed_methods.append(
                    {
                        "name": strings[name_index],
                        "signature": method_signature(proto_index),
                        "kind": kind,
                        "access_flags": access_flags,
                    }
                )
        return parsed_methods

    classes: list[dict[str, Any]] = []
    for index in range(class_count):
        item_offset = class_offset + (index * 32)
        class_index = struct.unpack_from("<I", data, item_offset)[0]
        class_data_offset = struct.unpack_from("<I", data, item_offset + 24)[0]
        if class_index >= len(type_descriptors):
            raise DexFormatError("Indeks class definition tidak valid.")

        names = _descriptor_to_names(type_descriptors[class_index])
        if names is None:
            continue
        class_name, package_name = names
        methods = read_class_methods(class_data_offset, class_index)
        classes.append(
            {
                "name": class_name,
                "package": package_name,
                "dex_file": dex_filename,
                "method_count": len(methods),
                "methods": methods,
            }
        )
    return classes


def _dex_sort_key(filename: str) -> int:
    match = re.fullmatch(r"classes([2-9]|[1-9][0-9]+)?\.dex", filename)
    if match is None or match.group(1) is None:
        return 1
    return int(match.group(1))


def _detect_libraries(classes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    evidence: dict[str, dict[str, Any]] = {}
    for prefix, library_name, category in LIBRARY_SIGNATURES:
        matches = [
            item["name"]
            for item in classes
            if item["name"].startswith(prefix)
        ]
        if not matches:
            continue
        evidence[library_name] = {
            "name": library_name,
            "category": category,
            "confidence": "medium",
            "method": "DEX class descriptor prefix",
            "evidence_count": len(matches),
            "evidence": matches[:5],
            "version": None,
        }
    return sorted(evidence.values(), key=lambda item: item["name"].casefold())


def analyze_apk_dex(apk_path: Path) -> dict[str, Any]:
    """Extract DEX class, package, method, and likely library metadata from an APK."""
    warnings: list[str] = []
    classes: list[dict[str, Any]] = []
    dex_file_results: list[dict[str, Any]] = []
    total_dex_bytes = 0

    with zipfile.ZipFile(apk_path) as archive:
        dex_infos = [
            info
            for info in archive.infolist()
            if not info.is_dir() and re.fullmatch(r"classes(?:[2-9]|[1-9][0-9]+)?\.dex", info.filename)
        ]
        dex_infos.sort(key=lambda info: _dex_sort_key(info.filename))

        if len(dex_infos) > MAX_DEX_FILES:
            warnings.append(
                f"Jumlah file DEX melebihi batas {MAX_DEX_FILES}; file sisanya tidak diproses."
            )
            dex_infos = dex_infos[:MAX_DEX_FILES]

        for info in dex_infos:
            total_dex_bytes += info.file_size
            if total_dex_bytes > MAX_DEX_TOTAL_BYTES:
                warnings.append(
                    f"Ukuran total DEX melebihi batas {MAX_DEX_TOTAL_BYTES // (1024 * 1024)} MB."
                )
                break
            try:
                dex_data = archive.read(info)
                parsed_classes = _parse_dex(dex_data, info.filename)
            except (DexFormatError, OSError, RuntimeError, struct.error, zipfile.BadZipFile) as error:
                warnings.append(f"{info.filename}: {str(error)[:180]}")
                continue

            if len(classes) + len(parsed_classes) > MAX_CLASS_DEFINITIONS:
                warnings.append("Jumlah class APK melebihi batas aman; hasil parsial disimpan.")
                break

            classes.extend(parsed_classes)
            dex_file_results.append(
                {"name": info.filename, "class_count": len(parsed_classes)}
            )

    # Class definitions should be unique across a valid multidex APK. Keep the
    # first occurrence and report duplicate definitions rather than inflating counts.
    unique_classes: dict[str, dict[str, Any]] = {}
    duplicate_count = 0
    for item in classes:
        if item["name"] in unique_classes:
            duplicate_count += 1
            continue
        unique_classes[item["name"]] = item
    classes = sorted(unique_classes.values(), key=lambda item: item["name"].casefold())

    if duplicate_count:
        warnings.append(f"{duplicate_count} definisi class duplikat diabaikan.")

    package_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"class_count": 0, "method_count": 0}
    )
    for item in classes:
        counts = package_counts[item["package"]]
        counts["class_count"] += 1
        counts["method_count"] += item["method_count"]

    libraries = _detect_libraries(classes)
    if not dex_infos:
        status = "unavailable"
        warnings.append("Tidak ditemukan file classes.dex di dalam APK.")
    elif not classes:
        status = "failed"
    elif warnings:
        status = "partial"
    else:
        status = "available"

    summary = {
        "status": status,
        "dex_file_count": len(dex_file_results),
        "dex_files": dex_file_results,
        "package_count": len(package_counts),
        "class_count": len(classes),
        "method_count": sum(item["method_count"] for item in classes),
        "library_count": len(libraries),
        "warnings": warnings,
    }
    packages = [
        {
            "name": name,
            "class_count": counts["class_count"],
            "method_count": counts["method_count"],
        }
        for name, counts in sorted(package_counts.items(), key=lambda item: item[0].casefold())
    ]
    return {"summary": summary, "packages": packages, "classes": classes, "libraries": libraries}

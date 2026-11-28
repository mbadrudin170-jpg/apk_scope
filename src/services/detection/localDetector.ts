export type Detection = {
  name: string;
  category: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  version: string | null;
};

const RN_NATIVE_LIBS = [
  "libreactnativejni.so",
  "libhermes.so",
  "libjsi.so",
  "libfbjni.so",
  "libyoga.so",
];

const FLUTTER_NATIVE_LIBS = ["libflutter.so", "libapp.so"];

export function detectFrameworks(info: {
  nativeLibs: string[];
  allFiles: string[];
}): Detection[] {
  const results: Detection[] = [];

  // React Native
  const rnHasNative = info.nativeLibs.some((lib) =>
    RN_NATIVE_LIBS.includes(lib),
  );
  const rnHasBundle = info.allFiles.includes("assets/index.android.bundle");
  const rnScore = (rnHasNative ? 2 : 0) + (rnHasBundle ? 1 : 0);
  if (rnScore > 0) {
    results.push({
      name: "React Native",
      category: "framework",
      confidence: rnScore >= 3 ? "high" : rnScore === 2 ? "medium" : "low",
      evidence: [
        ...(rnHasNative ? ["native lib React Native terdeteksi"] : []),
        ...(rnHasBundle ? ["assets/index.android.bundle ada"] : []),
      ],
      version: null,
    });
  }

  // Flutter
  const flutterHasNative = info.nativeLibs.some((lib) =>
    FLUTTER_NATIVE_LIBS.includes(lib),
  );
  const flutterHasAssets = info.allFiles.some((file) =>
    file.startsWith("assets/flutter_assets/"),
  );
  const flutterScore = (flutterHasNative ? 2 : 0) + (flutterHasAssets ? 1 : 0);
  if (flutterScore > 0) {
    results.push({
      name: "Flutter",
      category: "framework",
      confidence:
        flutterScore >= 3 ? "high" : flutterScore === 2 ? "medium" : "low",
      evidence: [
        ...(flutterHasNative ? ["native lib Flutter terdeteksi"] : []),
        ...(flutterHasAssets ? ["assets/flutter_assets ada"] : []),
      ],
      version: null,
    });
  }

  return results;
}

type JsSignature = {
  name: string;
  category: string;
  needles: string[];
  minHits: number;
};

export const JS_SIGNATURES: JsSignature[] = [
  {
    name: "Zustand",
    category: "state-management",
    needles: ["zustand", "createstore", "useboundstore", "zustand/middleware"],
    minHits: 2,
  },
  {
    name: "Redux",
    category: "state-management",
    needles: ["redux", "createstore", "combinereducers"],
    minHits: 2,
  },
  {
    name: "MobX",
    category: "state-management",
    needles: ["mobx", "makeobservable", "observable"],
    minHits: 2,
  },
];

export function detectJsLibrariesFromScan(
  scan: Record<string, number> | null,
): Detection[] {
  if (!scan) return [];

  const result: Detection[] = [];

  for (const signature of JS_SIGNATURES) {
    const hits = signature.needles.filter(
      (needle) => (scan[needle.toLowerCase()] ?? 0) > 0,
    );
    if (hits.length >= signature.minHits) {
      result.push({
        name: signature.name,
        category: signature.category,
        confidence: hits.length >= 3 ? "medium" : "low",
        evidence: hits.map(
          (hit) => `${hit} (${scan[hit.toLowerCase()] ?? 0}x)`,
        ),
        version: null,
      });
    }
  }

  return result;
}

type FlutterPackageSignature = {
  name: string;
  category: string;
  needles: string[];
  minHits: number;
};

export const FLUTTER_PACKAGE_SIGNATURES: FlutterPackageSignature[] = [
  {
    name: "Riverpod",
    category: "state-management",
    needles: ["riverpod", "statenotifier", "providercontainer", "ref.watch"],
    minHits: 2,
  },
  {
    name: "Freezed",
    category: "code-generation",
    needles: ["freezed", "copywith", "_$freezed", "tojson", "fromjson"],
    minHits: 2,
  },
  {
    name: "Bloc",
    category: "state-management",
    needles: ["bloc", "cubit", "blocprovider", "blocbuilder"],
    minHits: 2,
  },
];

export function detectFlutterPackagesFromScan(
  scan: Record<string, number> | null,
): Detection[] {
  if (!scan) return [];

  const result: Detection[] = [];

  for (const signature of FLUTTER_PACKAGE_SIGNATURES) {
    const hits = signature.needles.filter(
      (needle) => (scan[needle.toLowerCase()] ?? 0) > 0,
    );
    if (hits.length >= signature.minHits) {
      result.push({
        name: signature.name,
        category: signature.category,
        confidence: hits.length >= 3 ? "medium" : "low",
        evidence: hits.map((hit) => `${hit} (${scan[hit.toLowerCase()] ?? 0}x)`),
        version: null,
      });
    }
  }

  return result;
}

export function getAllJsNeedles(): string[] {
  return JS_SIGNATURES.flatMap((signature) => signature.needles);
}

export function getAllFlutterNeedles(): string[] {
  return FLUTTER_PACKAGE_SIGNATURES.flatMap(
    (signature) => signature.needles,
  );
}

export function findFlutterLibraryFile(allFiles: string[]): string | null {
  return (
    allFiles.find((file) => file.endsWith("libapp.so")) ??
    allFiles.find((file) => file.endsWith("libflutter.so")) ??
    null
  );
}

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

export function detectFrameworks(info: {
  nativeLibs: string[];
  allFiles: string[];
}): Detection[] {
  const hasNative = info.nativeLibs.some((lib) =>
    RN_NATIVE_LIBS.includes(lib),
  );
  const hasBundle = info.allFiles.includes("assets/index.android.bundle");
  const score = (hasNative ? 2 : 0) + (hasBundle ? 1 : 0);

  if (score === 0) return [];

  return [
    {
      name: "React Native",
      category: "framework",
      confidence: score >= 3 ? "high" : score === 2 ? "medium" : "low",
      evidence: [
        ...(hasNative ? ["native lib React Native terdeteksi"] : []),
        ...(hasBundle ? ["assets/index.android.bundle ada"] : []),
      ],
      version: null,
    },
  ];
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

export function getAllJsNeedles(): string[] {
  return JS_SIGNATURES.flatMap((signature) => signature.needles);
}

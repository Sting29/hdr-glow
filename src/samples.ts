// Real logos to try the tool with, bundled with the site so nothing is fetched
// from outside it.

export type SampleId = "lighthouse" | "kbtech";

export const SAMPLES: { id: SampleId; label: string; url: string; type: string }[] = [
  { id: "lighthouse", label: "Lighthouse", url: "/samples/lighthouse.jpg", type: "image/jpeg" },
  { id: "kbtech", label: "KB Tech", url: "/samples/kbtech.jpg", type: "image/jpeg" },
];

export async function makeSample(id: SampleId): Promise<File> {
  const sample = SAMPLES.find((entry) => entry.id === id);
  if (!sample) throw new Error("Unknown sample");
  const response = await fetch(sample.url);
  if (!response.ok) throw new Error("Could not load the sample");
  const blob = await response.blob();
  return new File([blob], sample.url.split("/").pop()!, { type: sample.type });
}

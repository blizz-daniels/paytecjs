"use client";

import Script from "next/script";

type LegacyPageScriptsProps = {
  scripts: string[];
};

export function LegacyPageScripts({ scripts }: LegacyPageScriptsProps) {
  return (
    <>
      {scripts.map((src) => (
        <Script key={src} src={src} strategy="afterInteractive" />
      ))}
    </>
  );
}

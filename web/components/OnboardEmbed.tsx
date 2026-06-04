/* Embeds the Tally form and forwards token context to its hidden fields.
   When a founder arrives from a token page (/onboard/?company=…&ticker=…&token_id=…),
   those params are appended to the Tally embed URL so the submission is pre-tagged
   with which token it's for. Static-export safe: reads window.location on mount. */
"use client";
import { useEffect, useState } from "react";

const EMBED_DEFAULTS = "hideTitle=1&transparentBackground=0";
const FORWARD = ["company", "ticker", "token_id"];

export function OnboardEmbed({ formUrl }: { formUrl: string }) {
  const [src, setSrc] = useState(`${formUrl}?${EMBED_DEFAULTS}`);

  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search);
    const params = new URLSearchParams(EMBED_DEFAULTS);
    for (const k of FORWARD) {
      const v = incoming.get(k);
      if (v) params.set(k, v);
    }
    setSrc(`${formUrl}?${params.toString()}`);
  }, [formUrl]);

  return (
    <iframe
      src={src}
      title="PUMPTANK founder opt-in form"
      className="h-[760px] w-full bg-white"
      loading="lazy"
    />
  );
}

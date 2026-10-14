import { showLaunch } from "./native";
const logoUrl = new URL("logo.png", document.baseURI).href;
export async function playSplash(): Promise<void> {
  const splash = document.createElement("div");
  splash.id = "launch-splash";
  splash.setAttribute("role", "status");
  splash.setAttribute("aria-label", "Forge is starting");
  splash.innerHTML = '<div class="splash-content"><div class="forge-logo splash-logo"><img alt="Forge" /></div><div class="splash-track"><span></span></div><p id="launch-status">Checking your session…</p></div>';
  const logo = splash.querySelector("img")!;
  logo.src = logoUrl;
  document.body.append(splash);
  await logo.decode().catch(() => { logo.hidden = true; splash.querySelector(".forge-logo")!.textContent = "FORGE"; });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const content = splash.querySelector<HTMLElement>(".splash-content")!;
  const animation = content.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
    { opacity: 0, transform: "translateY(20px) scale(.94)", filter: "blur(12px)", offset: 0 },
    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)", offset: .38 },
    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)", offset: 1 }
  ], { duration: reduced ? 350 : 2800, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
  const reveal = splash.querySelector(".splash-logo")!.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
    { clipPath: "inset(0 100% 0 0)", offset: 0 },
    { clipPath: "inset(0 70% 0 0)", offset: .3 },
    { clipPath: "inset(0 0% 0 0)", offset: .72 },
    { clipPath: "inset(0 0% 0 0)", offset: 1 }
  ], { duration: reduced ? 350 : 2800, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
  const progress = splash.querySelector(".splash-track span")!.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: reduced ? 350 : 2800, easing: "ease-in-out", fill: "forwards" });
  await showLaunch();
  await Promise.all([animation.finished, reveal.finished, progress.finished]);
  splash.querySelector("#launch-status")!.textContent = "Preparing Forge…";
}
export async function dismissSplash() {
  const splash = document.getElementById("launch-splash");
  if (!splash) return;
  await splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220, fill: "forwards" }).finished;
  splash.remove();
}

"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";

// ── The Living World — WebGL Earth at night (Three.js) ───────────────────────
// A smooth textured planet replacing the earlier Canvas 2D dot-matrix globe.
//
// Bundled texture assets (served from /public/globe, never fetched from third
// parties at runtime):
//   day.jpg    — NASA Blue Marble–derived, cloud-free land/ocean map from
//                Solar System Scope textures (CC BY 4.0 — solarsystemscope.com/textures).
//   night.jpg  — NASA Black Marble–derived city-lights map from Solar System
//                Scope textures (CC BY 4.0 — www.solarsystemscope.com/textures).
//   clouds.png — NASA-derived cloud transparency map (three.js examples;
//                underlying imagery: NASA, public domain).
//
// Layers: custom-shaded surface (dark ocean/charcoal land, warm night lights,
// soft terminator, teal fresnel edge) → slow cloud shell (desktop) → back-side
// atmosphere shader brighter toward the sun. The sun is fixed in world space,
// so geography rotates through the terminator. Rendering pauses when the tab
// is hidden or the globe leaves the viewport; reduced motion renders one
// static frame; `simplified` (mobile) drops clouds and parallax and lowers
// the pixel-ratio cap.

const ROT_PERIOD = 95; // seconds per rotation
const SUN = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();

const SURFACE_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vViewDirW = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SURFACE_FRAG = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vNormalW);
    float lambert = dot(n, sunDir);
    vec3 day = texture2D(dayTex, vUv).rgb;

    // stylize: deep black-blue ocean, dark charcoal land (land is brighter and
    // less blue than ocean in the Blue Marble map)
    float lum = dot(day, vec3(0.299, 0.587, 0.114));
    float landF = smoothstep(0.04, 0.20, lum - day.b * 0.45);
    vec3 ocean = vec3(0.020, 0.038, 0.070);
    vec3 land  = vec3(0.165, 0.195, 0.225);
    vec3 surf = mix(ocean, land, landF);

    // lit side reveals faint real texture detail; overall stays dark
    float lit = smoothstep(-0.15, 0.55, lambert);
    surf += day * 0.14 * lit * (0.35 + 0.65 * landF);
    surf *= 0.68 + 0.5 * smoothstep(-0.45, 0.65, lambert);

    // warm city lights, strongest on the night side, soft across the terminator
    float night = smoothstep(0.22, -0.30, lambert);
    vec3 lightsRGB = texture2D(nightTex, vUv).rgb;
    float li = dot(lightsRGB, vec3(0.34, 0.45, 0.21));
    vec3 warm = vec3(1.0, 0.78, 0.50);
    surf += warm * pow(li, 0.85) * (0.8 + 2.6 * night);

    // thin teal fresnel edge, brighter toward the sun
    float fres = pow(1.0 - clamp(dot(n, normalize(vViewDirW)), 0.0, 1.0), 3.2);
    float sunSide = 0.45 + 0.55 * smoothstep(-0.6, 0.8, lambert);
    surf += vec3(0.28, 0.72, 0.68) * fres * 0.3 * sunSide;

    gl_FragColor = vec4(surf * 1.25, 1.0);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    // back-side shell: strongest right at the limb, fading outward
    float rim = pow(clamp(dot(n, viewDir), 0.0, 1.0), 5.0);
    // thin & directional — brighter near the light-facing edge
    float sunSide = 0.35 + 0.65 * smoothstep(-0.7, 0.9, dot(n, sunDir));
    vec3 teal = mix(vec3(0.16, 0.55, 0.55), vec3(0.45, 0.85, 0.88), sunSide);
    gl_FragColor = vec4(teal, rim * 0.55 * sunSide);
  }
`;

export default function Globe({ simplified = false }: { simplified?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.getAttribute("data-motion") === "reduced";

    // ── renderer / scene / camera ──
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch { return; } // WebGL unavailable — placeholder stays empty, hero unaffected
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
    camera.position.set(0, 0, 3.55);

    const loader = new THREE.TextureLoader();
    const dayTex = loader.load("/globe/day.jpg");
    const nightTex = loader.load("/globe/night.jpg");
    dayTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = 4; nightTex.anisotropy = 4;

    const group = new THREE.Group();       // parallax tilt
    const earthGroup = new THREE.Group();  // rotation
    earthGroup.rotation.x = -0.05;
    group.add(earthGroup);
    scene.add(group);

    const surfGeo = new THREE.SphereGeometry(1, simplified ? 48 : 96, simplified ? 32 : 64);
    const surfMat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
      uniforms: { dayTex: { value: dayTex }, nightTex: { value: nightTex }, sunDir: { value: SUN } },
    });
    const earth = new THREE.Mesh(surfGeo, surfMat);
    earthGroup.add(earth);

    // atmosphere shell (back side)
    const atmoGeo = new THREE.SphereGeometry(1.045, 48, 32);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
      uniforms: { sunDir: { value: SUN } },
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const atmo = new THREE.Mesh(atmoGeo, atmoMat);
    group.add(atmo);

    // clouds (desktop, motion allowed)
    let clouds: THREE.Mesh | null = null;
    let cloudsTex: THREE.Texture | null = null;
    if (!simplified && !reduced) {
      cloudsTex = loader.load("/globe/clouds.png");
      const cloudMat = new THREE.MeshBasicMaterial({
        alphaMap: cloudsTex, color: new THREE.Color(0.62, 0.72, 0.78),
        transparent: true, opacity: 0.038, depthWrite: false,
      });
      clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 48, 32), cloudMat);
      earthGroup.add(clouds);
    }

    // ── sizing (width-only; square canvas) ──
    let W = 0;
    const resize = () => {
      const w = Math.max(1, Math.round(wrap.getBoundingClientRect().width));
      if (w === W) return;
      W = w;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, simplified ? 1.5 : 2));
      renderer.setSize(w, w, false);
      if (reduced) renderer.render(scene, camera);
    };

    // ── animation ──
    const par = { tx: 0, ty: 0, x: 0, y: 0 };
    let raf = 0, running = false, visible = true, inView = true;
    const t0 = performance.now();
    const BASE_ROT = -0.8; // Atlantic view — Americas + Europe/Africa face the camera

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      par.x += (par.tx - par.x) * 0.04;
      par.y += (par.ty - par.y) * 0.04;
      earthGroup.rotation.y = BASE_ROT + (t / ROT_PERIOD) * Math.PI * 2;
      group.rotation.y = par.x * 0.05;
      group.rotation.x = par.y * 0.04;
      if (clouds) clouds.rotation.y = t * 0.004; // drifts slightly vs the surface
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    const setRunning = () => {
      const should = !reduced && visible && inView;
      if (should && !running) { running = true; raf = requestAnimationFrame(frame); }
      else if (!should && running) { running = false; cancelAnimationFrame(raf); }
    };

    const onPointer = (e: PointerEvent) => {
      const box = wrap.getBoundingClientRect();
      par.tx = Math.max(-1, Math.min(1, ((e.clientX - box.left) / box.width - 0.5) * 2));
      par.ty = Math.max(-1, Math.min(1, ((e.clientY - box.top) / box.height - 0.5) * 2));
    };
    const onLeave = () => { par.tx = 0; par.ty = 0; };
    const onVis = () => { visible = !document.hidden; setRunning(); };
    const io = new IntersectionObserver((es) => { inView = es[0]?.isIntersecting ?? true; setRunning(); }, { threshold: 0.05 });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    if (reduced) {
      earthGroup.rotation.y = BASE_ROT;
      // textures load async — render the static frame once they arrive
      const t1 = setInterval(() => renderer.render(scene, camera), 250);
      setTimeout(() => clearInterval(t1), 3000);
      renderer.render(scene, camera);
    } else {
      setRunning();
      document.addEventListener("visibilitychange", onVis);
      if (!simplified) {
        wrap.addEventListener("pointermove", onPointer, { passive: true });
        wrap.addEventListener("pointerleave", onLeave);
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      wrap.removeEventListener("pointermove", onPointer);
      wrap.removeEventListener("pointerleave", onLeave);
      io.disconnect(); ro.disconnect();
      surfGeo.dispose(); surfMat.dispose(); atmoGeo.dispose(); atmoMat.dispose();
      dayTex.dispose(); nightTex.dispose(); cloudsTex?.dispose();
      clouds?.geometry.dispose(); (clouds?.material as THREE.Material | undefined)?.dispose();
      renderer.dispose();
    };
  }, [simplified]);

  return (
    <div ref={wrapRef} aria-hidden
      style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", pointerEvents: "auto" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block",
        width: "100%", height: "100%",
        animation: "alca-globe-in 1.6s cubic-bezier(0.16,1,0.3,1) both" }} />
      <style>{`@keyframes alca-globe-in { from { opacity: 0; transform: scale(0.975); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}

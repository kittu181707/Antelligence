import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface AtmosphericSceneProps {
  scrollProgress?: number;
  interactive?: boolean;
}

export function AtmosphericScene({ scrollProgress = 0, interactive = true }: AtmosphericSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hasWebGL, setHasWebGL] = useState(true);
  const scrollRef = useRef(scrollProgress);

  useEffect(() => {
    scrollRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Check WebGL availability
    const canvasTest = document.createElement('canvas');
    const gl = canvasTest.getContext('webgl2') || canvasTest.getContext('webgl');
    if (!gl) {
      setHasWebGL(false);
      return;
    }

    let isDisposed = false;
    let animationFrameId: number;

    // Scene, Camera, Renderer
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060f0a, 0.0018);

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 2000);
    camera.position.set(0, 14, 52);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      container.appendChild(renderer.domElement);
    } catch {
      setHasWebGL(false);
      return;
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0x0a2618, 1.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffdf99, 2.8);
    sunLight.position.set(40, 30, 35);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x2ec47d, 1.9);
    rimLight.position.set(-35, -15, -20);
    scene.add(rimLight);

    // 1. Planetary Celestial Globe / Terrain Horizon
    const planetGroup = new THREE.Group();
    planetGroup.position.set(0, -32, 0);
    scene.add(planetGroup);

    // Planet surface
    const planetRadius = 38;
    const planetGeo = new THREE.SphereGeometry(planetRadius, 64, 48);

    // Procedural terrain / continent texture via HTML5 canvas
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 1024;
    textureCanvas.height = 512;
    const ctx = textureCanvas.getContext('2d');
    if (ctx) {
      // Midnight ocean base
      const grad = ctx.createLinearGradient(0, 0, 1024, 512);
      grad.addColorStop(0, '#06130c');
      grad.addColorStop(0.5, '#0a1d13');
      grad.addColorStop(1, '#08170f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // Continent landmass contours with subtle emerald & gold patina
      ctx.fillStyle = '#123422';
      for (let i = 0; i < 48; i++) {
        const x = (i * 97) % 1024;
        const y = (i * 61) % 512;
        const rad = 25 + ((i * 13) % 75);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // City lights / urban luminescence
      ctx.fillStyle = '#dfb86c';
      for (let j = 0; j < 300; j++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        const size = Math.random() < 0.15 ? 1.8 : 0.9;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const planetTexture = new THREE.CanvasTexture(textureCanvas);
    planetTexture.wrapS = THREE.RepeatWrapping;
    planetTexture.wrapT = THREE.ClampToEdgeWrapping;

    const planetMat = new THREE.MeshStandardMaterial({
      map: planetTexture,
      roughness: 0.72,
      metalness: 0.18,
      color: 0x163a28,
      emissive: 0x05130b,
    });
    const planetMesh = new THREE.Mesh(planetGeo, planetMat);
    planetGroup.add(planetMesh);

    // Atmospheric Glow Halo (Custom Fresnel Shader)
    const atmosphereGeo = new THREE.SphereGeometry(planetRadius * 1.055, 64, 48);
    const atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float fresnel = dot(normal, viewDir);
          fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
          float intensity = pow(fresnel, 2.6);
          
          // Renaissance palette: emerald green gradient to antique gold corona
          vec3 emerald = vec3(0.18, 0.77, 0.49);
          vec3 gold = vec3(0.85, 0.72, 0.38);
          vec3 finalColor = mix(emerald, gold, intensity * 0.45);
          
          gl_FragColor = vec4(finalColor, intensity * 0.75);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    planetGroup.add(atmosphereMesh);

    // Aerosol / Cloud Flow Layer
    const cloudsGeo = new THREE.SphereGeometry(planetRadius * 1.018, 48, 36);
    const cloudsMat = new THREE.MeshStandardMaterial({
      color: 0x8ab99e,
      roughness: 0.9,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    planetGroup.add(cloudsMesh);

    // 2. Suspended Particulate Matter (PM2.5 & PM10 dynamic flow field)
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = width < 640;
    const isTablet = width < 1024;
    const particleCount = prefersReducedMotion ? 400 : isMobile ? 650 : isTablet ? 1200 : 2200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount);
    const angles = new Float32Array(particleCount);
    const heights = new Float32Array(particleCount);

    const colorClean = new THREE.Color(0x2ec47d); // Emerald clean air
    const colorGold = new THREE.Color(0xdfb86c);  // Suspended mineral dust
    const colorAmber = new THREE.Color(0xe67e33); // Urban combustion soot

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 22 + Math.random() * 45;
      const height = -12 + Math.random() * 32;

      angles[i] = angle;
      radii[i] = radius;
      heights[i] = height;
      speeds[i] = prefersReducedMotion ? 0.0003 : 0.001 + Math.random() * 0.003;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      // Color distribution based on altitude and random pollution hotspots
      const ratio = Math.random();
      const pColor = ratio < 0.55 ? colorClean : ratio < 0.85 ? colorGold : colorAmber;

      colors[i * 3] = pColor.r;
      colors[i * 3 + 1] = pColor.g;
      colors[i * 3 + 2] = pColor.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Create custom smooth circle texture for particles
    const particleCanvas = document.createElement('canvas');
    particleCanvas.width = 64;
    particleCanvas.height = 64;
    const pCtx = particleCanvas.getContext('2d');
    if (pCtx) {
      const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)');
      grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 64, 64);
    }
    const particleTexture = new THREE.CanvasTexture(particleCanvas);

    const particleMat = new THREE.PointsMaterial({
      size: 1.4,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // 3. Topographical Wireframe Grid (Renaissance Astrolabe / Surveying Plane)
    const gridGeo = new THREE.RingGeometry(18, 55, 48, 8);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0xcba157,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.rotation.x = Math.PI / 2;
    gridMesh.position.y = -6;
    scene.add(gridMesh);

    // Mouse & Pointer Parallax State
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const handlePointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = -(e.clientY / window.innerHeight) * 2 + 1;
      mouse.targetX = normX * 4;
      mouse.targetY = normY * 3;
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });

    // Handle Window Resize
    const handleResize = () => {
      if (isDisposed || !container) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize, { passive: true });

    // Animation Loop with scroll-based choreography
    let clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);

      // Check tab visibility to save power
      if (document.hidden) return;

      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Smooth pointer parallax lerping
      mouse.x += (mouse.targetX - mouse.x) * 0.04;
      mouse.y += (mouse.targetY - mouse.y) * 0.04;

      // Natural celestial rotation
      planetMesh.rotation.y += 0.0008;
      cloudsMesh.rotation.y += 0.0013;
      gridMesh.rotation.z -= 0.0004;

      // Dynamic Particle Flow Physics
      const posArray = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        angles[i] += speeds[i];
        const r = radii[i] + Math.sin(time * 0.5 + i) * 0.8;
        const h = heights[i] + Math.cos(time * 0.8 + i * 2) * 0.4;
        posArray[i * 3] = Math.cos(angles[i]) * r;
        posArray[i * 3 + 1] = h;
        posArray[i * 3 + 2] = Math.sin(angles[i]) * r;
      }
      particleGeo.attributes.position.needsUpdate = true;

      // Scroll-Driven Renaissance Choreography:
      // Map scrollProgress (0 to 1) to camera and scene positions
      const p = Math.max(0, Math.min(1, scrollRef.current));

      // Target camera trajectory:
      // Stage 0 (0.00 - 0.20): Hero & Atmosphere (high vantage point, majestic horizon)
      // Stage 1 (0.20 - 0.45): Urban Canopy & Pollution (closer, angled toward ground level)
      // Stage 2 (0.45 - 0.70): Intelligent Route Optimization (side perspective, focus on pathways)
      // Stage 3 (0.70 - 0.85): Personal & Community Impact (rising view, illuminated emerald clarity)
      // Stage 4 (0.85 - 1.00): Pan-India Monitoring & Epilogue (broad cosmic outlook)
      let targetCamX = mouse.x;
      let targetCamY = 14 - p * 12 + mouse.y;
      let targetCamZ = 52 - Math.sin(p * Math.PI) * 16;
      let targetLookAtY = -6 + p * 4;

      if (p < 0.25) {
        // Hero / Atmosphere
        targetCamX = mouse.x;
        targetCamY = 14 + mouse.y * 0.8;
        targetCamZ = 52;
      } else if (p < 0.55) {
        // Urban / Pollution
        const sub = (p - 0.25) / 0.3;
        targetCamX = 12 * sub + mouse.x;
        targetCamY = 14 - sub * 8 + mouse.y;
        targetCamZ = 52 - sub * 14;
      } else if (p < 0.8) {
        // Route Optimization / Impact
        const sub = (p - 0.55) / 0.25;
        targetCamX = (12 - sub * 20) + mouse.x;
        targetCamY = (6 + sub * 6) + mouse.y;
        targetCamZ = (38 + sub * 8);
      } else {
        // Monitoring & Epilogue
        const sub = (p - 0.8) / 0.2;
        targetCamX = (-8 + sub * 8) + mouse.x;
        targetCamY = (12 + sub * 6) + mouse.y;
        targetCamZ = (46 + sub * 10);
      }

      camera.position.x += (targetCamX - camera.position.x) * 0.05;
      camera.position.y += (targetCamY - camera.position.y) * 0.05;
      camera.position.z += (targetCamZ - camera.position.z) * 0.05;

      camera.lookAt(0, targetLookAtY, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('resize', handleResize);

      // Clean up geometries and materials
      planetGeo.dispose();
      planetMat.dispose();
      planetTexture.dispose();
      atmosphereGeo.dispose();
      atmosphereMat.dispose();
      cloudsGeo.dispose();
      cloudsMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      particleTexture.dispose();
      gridGeo.dispose();
      gridMat.dispose();

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      }
    };
  }, [interactive]);

  return (
    <div
      ref={mountRef}
      className="atmospheric-scene-canvas"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {!hasWebGL && (
        <div
          className="atmospheric-fallback"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 30%, #0d281a 0%, #08150f 50%, #050a07 100%)',
          }}
        />
      )}
    </div>
  );
}

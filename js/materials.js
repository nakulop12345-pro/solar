/**
 * materials.js — custom GLSL materials.
 *
 * All shaders implement the three.js log-depth chunk so they remain correct when
 * `renderer.capabilities.logarithmicDepthBuffer` is true. The Sun is permanently
 * at the world origin, so light directions reduce to `normalize(-vWorldPos)` —
 * no per-frame uniform uploads are required for lighting.
 */

import * as THREE from 'three';

const LOGDEPTH_PARS_VERTEX   = '#include <common>\n#include <logdepthbuf_pars_vertex>';
const LOGDEPTH_PARS_FRAGMENT = '#include <common>\n#include <logdepthbuf_pars_fragment>';

/* ══════════════════════════════════════════════════════════════════════
   ATMOSPHERE — Fresnel limb scattering, lit from the origin.
   ══════════════════════════════════════════════════════════════════════ */
export function createAtmosphereMaterial({ color = '#6aa8ff', intensity = 1.0, power = 2.4 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:     { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uPower:     { value: power },
    },
    vertexShader: /* glsl */`
      ${LOGDEPTH_PARS_VERTEX}
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        vWorldNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      ${LOGDEPTH_PARS_FRAGMENT}
      uniform vec3  uColor;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        #include <logdepthbuf_fragment>

        vec3 N = normalize( vWorldNormal );
        vec3 V = normalize( cameraPosition - vWorldPos );
        vec3 L = normalize( -vWorldPos );          // Sun sits at the origin

        // Fresnel rim: strongest where the surface turns away from the eye.
        float rim = 1.0 - clamp( abs( dot( N, V ) ), 0.0, 1.0 );
        rim = pow( rim, uPower );

        // Day/night: the shell is only illuminated on the sunward hemisphere.
        float sun = clamp( dot( N, L ), 0.0, 1.0 );
        float lit = 0.10 + 0.90 * pow( sun, 0.55 );

        // Forward scattering brightens the limb at grazing sun angles.
        float scatter = pow( clamp( 1.0 - abs( dot( N, L ) ), 0.0, 1.0 ), 3.0 ) * 0.30;

        float a = rim * uIntensity * lit;
        vec3 col = uColor * ( 0.85 + scatter );

        gl_FragColor = vec4( col * a, a );
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   SUN — layered animated photosphere + corona tint.
   ══════════════════════════════════════════════════════════════════════ */
export function createSunMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap:  { value: map || null },
      uTime: { value: 0 },
    },
    defines: map ? {} : { NO_MAP: '' },
    vertexShader: /* glsl */`
      ${LOGDEPTH_PARS_VERTEX}
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vWorldNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      ${LOGDEPTH_PARS_FRAGMENT}
      uniform sampler2D uMap;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        #include <logdepthbuf_fragment>

        #ifndef NO_MAP
          // Two counter-drifting samples give the photosphere a slow boil.
          vec2 uv1 = vUv + vec2( uTime * 0.0040, uTime * 0.0011 );
          vec2 uv2 = vUv * vec2( 1.9, 1.4 ) + vec2( -uTime * 0.0071, uTime * 0.0023 );
          vec3 a = texture2D( uMap, uv1 ).rgb;
          vec3 b = texture2D( uMap, uv2 ).rgb;
          vec3 col = mix( a, b, 0.45 );
        #else
          vec3 col = vec3( 1.0, 0.66, 0.22 );
        #endif

        // Limb darkening is reversed here — the corona makes the edge brighter.
        vec3 N = normalize( vWorldNormal );
        vec3 V = normalize( cameraPosition - vWorldPos );
        float rim = 1.0 - clamp( dot( N, V ), 0.0, 1.0 );
        col *= 1.30;
        col += vec3( 1.00, 0.52, 0.14 ) * pow( rim, 2.2 ) * 1.5;

        gl_FragColor = vec4( col, 1.0 );
      }
    `,
    toneMapped: true,
  });
}

/** Soft additive halo that fades outward — the visible corona. */
export function createCoronaMaterial({ color = '#ffae52', intensity = 0.85, power = 3.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:     { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uPower:     { value: power },
    },
    vertexShader: /* glsl */`
      ${LOGDEPTH_PARS_VERTEX}
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vWorldNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      ${LOGDEPTH_PARS_FRAGMENT}
      uniform vec3  uColor;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize( vWorldNormal );
        vec3 V = normalize( cameraPosition - vWorldPos );
        float rim = 1.0 - clamp( abs( dot( N, V ) ), 0.0, 1.0 );
        float a = pow( rim, uPower ) * uIntensity;
        gl_FragColor = vec4( uColor * a, a );
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   EARTH — day/night blend, cloud deck, ocean specular, terminator warmth.
   The day map's alpha channel carries the ocean mask.
   ══════════════════════════════════════════════════════════════════════ */
export function createEarthMaterial(maps) {
  const { dayMap, nightMap, cloudMap, normalMap } = maps;
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay:       { value: dayMap || null },
      uNight:     { value: nightMap || null },
      uClouds:    { value: cloudMap || null },
      uNormalMap: { value: normalMap || null },
      uTime:      { value: 0 },
      uHasNight:  { value: nightMap ? 1 : 0 },
      uHasClouds: { value: cloudMap ? 1 : 0 },
    },
    defines: {
      USE_NORMALMAP: normalMap ? '' : undefined,
      HAS_NIGHT:  nightMap  ? '' : undefined,
      HAS_CLOUDS: cloudMap  ? '' : undefined,
    },
    vertexShader: /* glsl */`
      ${LOGDEPTH_PARS_VERTEX}
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vTangentX;
      varying vec3 vTangentY;

      void main() {
        vUv = uv;
        mat3 nm = mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz );
        vWorldNormal = normalize( nm * normal );

        #ifdef USE_NORMALMAP
          // Sphere UVs give a stable tangent frame without extra attributes.
          vec3 up = vec3( 0.0, 1.0, 0.0 );
          vTangentX = normalize( cross( up, vWorldNormal ) + vec3( 1e-5 ) );
          vTangentY = normalize( cross( vWorldNormal, vTangentX ) );
        #endif

        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      ${LOGDEPTH_PARS_FRAGMENT}
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform sampler2D uClouds;
      uniform sampler2D uNormalMap;
      uniform float uTime;
      uniform float uHasNight;
      uniform float uHasClouds;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vTangentX;
      varying vec3 vTangentY;

      void main() {
        #include <logdepthbuf_fragment>

        vec3 Ng = normalize( vWorldNormal );

        #ifdef USE_NORMALMAP
          vec3 nTex = texture2D( uNormalMap, vUv ).xyz * 2.0 - 1.0;
          vec3 N = normalize( vTangentX * nTex.x + vTangentY * nTex.y + Ng * nTex.z );
        #else
          vec3 N = Ng;
        #endif

        vec3 L = normalize( -vWorldPos );
        vec3 V = normalize( cameraPosition - vWorldPos );

        float ndl  = dot( N, L );
        float day  = smoothstep( -0.12, 0.22, ndl );
        float diff = clamp( ndl, 0.0, 1.0 );

        vec4 dayTex = texture2D( uDay, vUv );
        vec3 albedo = dayTex.rgb;
        float ocean = dayTex.a;

        // ── Day side ──────────────────────────────────────────────────
        vec3 col = albedo * ( 0.09 + 0.95 * diff );

        // Specular sun-glint on water only.
        vec3 H = normalize( L + V );
        float spec = pow( max( dot( N, H ), 0.0 ), 90.0 ) * ocean;
        col += vec3( 1.0, 0.94, 0.82 ) * spec * 1.5;

        // ── Night side: city lights ───────────────────────────────────
        #ifdef HAS_NIGHT
          vec3 lights = texture2D( uNight, vUv ).rgb;
          col += lights * ( 1.0 - day ) * 1.35;
        #endif

        // ── Cloud deck (slightly faster than the surface) ─────────────
        #ifdef HAS_CLOUDS
          vec2 cuv = vec2( vUv.x + uTime * 0.0009, vUv.y );
          float cloud = texture2D( uClouds, cuv ).r;
          float cloudLit = 0.10 + 0.92 * diff;
          col = mix( col, vec3( 1.0 ) * cloudLit, cloud * 0.88 );
        #endif

        // ── Atmospheric rim, strongest near the terminator ────────────
        float rim = pow( 1.0 - clamp( dot( Ng, V ), 0.0, 1.0 ), 3.0 );
        float term = exp( -pow( ndl / 0.28, 2.0 ) );
        col += vec3( 0.28, 0.48, 0.92 ) * rim * ( 0.55 + term * 0.85 ) * 0.85;

        gl_FragColor = vec4( col, 1.0 );
      }
    `,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   PLANETARY RINGS — radial UVs + analytic shadow from the parent body.
   ══════════════════════════════════════════════════════════════════════ */
export function createRingMaterial(map, innerRadius, outerRadius, planetRadius) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap:          { value: map || null },
      uInner:        { value: innerRadius },
      uOuter:        { value: outerRadius },
      uPlanetRadius: { value: planetRadius },
      uTint:         { value: new THREE.Color('#ffffff') },
    },
    vertexShader: /* glsl */`
      ${LOGDEPTH_PARS_VERTEX}
      uniform float uInner;
      uniform float uOuter;
      varying vec2 vRUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vPlanetPos;

      void main() {
        float r = length( position.xy );
        vRUv = vec2( ( r - uInner ) / max( 0.0001, uOuter - uInner ), 0.5 );

        mat3 nm = mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz );
        vWorldNormal = normalize( nm * vec3( 0.0, 0.0, 1.0 ) );

        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorldPos = wp.xyz;
        vPlanetPos = modelMatrix[3].xyz;      // ring geometry is centred on the planet

        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      ${LOGDEPTH_PARS_FRAGMENT}
      uniform sampler2D uMap;
      uniform float uPlanetRadius;
      uniform vec3  uTint;

      varying vec2 vRUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vPlanetPos;

      void main() {
        #include <logdepthbuf_fragment>

        vec4 tex = texture2D( uMap, vRUv );
        if ( tex.a < 0.004 ) discard;

        vec3 N = normalize( vWorldNormal );
        vec3 L = normalize( -vPlanetPos );          // direction from planet to Sun

        // ── Analytic shadow: cylindrical occluder along the Sun direction ──
        vec3 rel  = vWorldPos - vPlanetPos;
        float along = dot( rel, L );
        vec3 perpV = rel - along * L;
        float perp = length( perpV );
        float shadow = 1.0;
        if ( along < 0.0 ) {
          shadow = smoothstep( uPlanetRadius * 0.94, uPlanetRadius * 1.16, perp );
          shadow = mix( 0.10, 1.0, shadow );
        }

        // Forward scattering: rings brighten when the Sun grazes their plane.
        float graze = 1.0 - abs( dot( N, L ) );
        float bright = 0.42 + 0.58 * abs( dot( N, L ) );
        float forward = 0.30 * pow( graze, 3.0 );

        vec3 col = tex.rgb * uTint * ( bright + forward ) * shadow;
        float alpha = clamp( tex.a * ( 0.55 + 0.45 * shadow ), 0.0, 1.0 );

        gl_FragColor = vec4( col, alpha );
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   STAR FIELD — one draw call, GPU-side size attenuation + twinkle.
   ══════════════════════════════════════════════════════════════════════ */
export function createStarMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0 },
      uPixelRatio:{ value: 1 },
      uScale:     { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute vec3  aColor;
      attribute float aPhase;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uScale;

      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;

        // Very slow scintillation — perceptible only on the brightest stars.
        float tw = 0.82 + 0.18 * sin( uTime * 0.9 + aPhase * 6.2831 );
        vAlpha = tw;

        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;

        float size = aSize * uScale * uPixelRatio;
        gl_PointSize = clamp( size * ( 320.0 / max( 0.001, -mv.z ) ) * 0.9, 0.6, 26.0 );
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot( d, d );
        if ( r2 > 0.25 ) discard;

        // Gaussian core + faint diffraction halo.
        float core = exp( -r2 * 22.0 );
        float halo = exp( -r2 * 5.0 ) * 0.22;

        float a = clamp( core + halo, 0.0, 1.0 ) * vAlpha;
        gl_FragColor = vec4( vColor * a, a );
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
}

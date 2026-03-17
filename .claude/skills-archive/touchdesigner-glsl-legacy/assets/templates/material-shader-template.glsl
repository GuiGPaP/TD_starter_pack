// ============================================================================
// TOUCHDESIGNER GLSL MAT TEMPLATE
// ============================================================================
// Complete material template for 3D rendering with vertex and fragment shaders
// Use with Render TOP and geometry
// ============================================================================

// ============================================================================
// VERTEX SHADER
// ============================================================================
#ifdef VERTEX_SHADER

// ----------------------------------------------------------------------------
// VERTEX INPUTS (Attributes from geometry)
// ----------------------------------------------------------------------------
in vec3 aPosition;      // Vertex position
in vec3 aNormal;        // Vertex normal
in vec3 aTangent;       // Vertex tangent
in vec2 aTexCoord0;     // Primary UV coordinates
in vec2 aTexCoord1;     // Secondary UV coordinates (if available)
in vec4 aColor;         // Vertex color

// ----------------------------------------------------------------------------
// VERTEX OUTPUTS (Passed to fragment shader)
// ----------------------------------------------------------------------------
out vec3 vPosition;     // World space position
out vec3 vNormal;       // World space normal
out vec3 vTangent;      // World space tangent
out vec2 vTexCoord;     // UV coordinates
out vec4 vColor;        // Vertex color
out vec3 vViewDir;      // View direction

// ----------------------------------------------------------------------------
// TD AUTO-GENERATED UNIFORMS
// ----------------------------------------------------------------------------
// uTDMats[0] = world matrix
// uTDMats[1] = camera matrix
// uTDMats[2] = projection matrix
// uTDMats[3] = worldCam matrix
// uTDMats[4] = worldCamProject matrix
// uTDMats[5] = camProject matrix

// uTDGeneral[0].x = near plane
// uTDGeneral[0].y = far plane
// uTDGeneral[0].z = aspect ratio

// uTDCamInfos[0].xy = camera resolution
// uTDCamInfos[0].z  = camera aspect ratio

// ----------------------------------------------------------------------------
// CUSTOM VERTEX UNIFORMS
// ----------------------------------------------------------------------------
uniform float uTime;
uniform float uDisplacementAmount;
uniform vec3 uWindDirection;

// ----------------------------------------------------------------------------
// VERTEX HELPER FUNCTIONS
// ----------------------------------------------------------------------------

// Transform normal to world space
vec3 transformNormal(vec3 normal) {
    return normalize(mat3(uTDMats[0]) * normal);
}

// Simple noise for displacement
float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float n = hash(i);
    return n;
}

// ----------------------------------------------------------------------------
// VERTEX MAIN
// ----------------------------------------------------------------------------
void main() {
    // Transform position to world space
    vec4 worldPos = uTDMats[0] * vec4(aPosition, 1.0);
    
    // Apply displacement (example)
    float displacement = noise3D(worldPos.xyz + uTime) * uDisplacementAmount;
    worldPos.xyz += aNormal * displacement;
    
    // Calculate final position
    gl_Position = uTDMats[4] * vec4(aPosition + aNormal * displacement, 1.0);
    
    // Pass data to fragment shader
    vPosition = worldPos.xyz;
    vNormal = transformNormal(aNormal);
    vTangent = transformNormal(aTangent);
    vTexCoord = aTexCoord0;
    vColor = aColor;
    
    // Calculate view direction
    vec3 cameraPos = -uTDMats[1][3].xyz;
    vViewDir = normalize(cameraPos - vPosition);
}

#endif // VERTEX_SHADER

// ============================================================================
// FRAGMENT SHADER
// ============================================================================
#ifdef FRAGMENT_SHADER

// ----------------------------------------------------------------------------
// FRAGMENT INPUTS (From vertex shader)
// ----------------------------------------------------------------------------
in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec2 vTexCoord;
in vec4 vColor;
in vec3 vViewDir;

// ----------------------------------------------------------------------------
// FRAGMENT OUTPUT
// ----------------------------------------------------------------------------
out vec4 fragColor;

// For Multiple Render Targets (MRT):
// layout(location = 0) out vec4 outColor;
// layout(location = 1) out vec4 outNormal;
// layout(location = 2) out vec4 outPosition;

// ----------------------------------------------------------------------------
// TEXTURE UNIFORMS
// ----------------------------------------------------------------------------
uniform sampler2D sAlbedoTex;
uniform sampler2D sNormalTex;
uniform sampler2D sRoughnessTex;
uniform sampler2D sMetallicTex;

// ----------------------------------------------------------------------------
// MATERIAL UNIFORMS
// ----------------------------------------------------------------------------
uniform vec3 uAlbedo;
uniform float uRoughness;
uniform float uMetallic;
uniform float uAO;

// Lighting uniforms
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uLightIntensity;

// ----------------------------------------------------------------------------
// FRAGMENT HELPER FUNCTIONS
// ----------------------------------------------------------------------------

// Calculate TBN matrix for normal mapping
mat3 calculateTBN() {
    vec3 N = normalize(vNormal);
    vec3 T = normalize(vTangent);
    T = normalize(T - dot(T, N) * N);  // Gram-Schmidt
    vec3 B = cross(N, T);
    return mat3(T, B, N);
}

// Sample and apply normal map
vec3 applyNormalMap(sampler2D normalMap, vec2 uv) {
    vec3 normalSample = texture(normalMap, uv).xyz * 2.0 - 1.0;
    mat3 TBN = calculateTBN();
    return normalize(TBN * normalSample);
}

// Simple Lambertian diffuse
vec3 calculateDiffuse(vec3 normal, vec3 lightDir, vec3 albedo) {
    float NdotL = max(dot(normal, lightDir), 0.0);
    return albedo * NdotL;
}

// Blinn-Phong specular
vec3 calculateSpecular(vec3 normal, vec3 lightDir, vec3 viewDir, float roughness) {
    vec3 halfDir = normalize(lightDir + viewDir);
    float NdotH = max(dot(normal, halfDir), 0.0);
    float shininess = (1.0 - roughness) * 256.0;
    float spec = pow(NdotH, shininess);
    return vec3(spec);
}

// Simplified PBR (Fresnel-Schlick)
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// ----------------------------------------------------------------------------
// FRAGMENT MAIN
// ----------------------------------------------------------------------------
void main() {
    // ========================================================================
    // MATERIAL PROPERTIES
    // ========================================================================
    
    // Sample textures
    vec3 albedo = texture(sAlbedoTex, vTexCoord).rgb * uAlbedo;
    float roughness = texture(sRoughnessTex, vTexCoord).r * uRoughness;
    float metallic = texture(sMetallicTex, vTexCoord).r * uMetallic;
    
    // Apply normal mapping
    vec3 normal = applyNormalMap(sNormalTex, vTexCoord);
    
    // ========================================================================
    // LIGHTING CALCULATION
    // ========================================================================
    
    vec3 lightDir = normalize(uLightDir);
    vec3 viewDir = normalize(vViewDir);
    
    // Diffuse
    vec3 diffuse = calculateDiffuse(normal, lightDir, albedo);
    
    // Specular
    vec3 specular = calculateSpecular(normal, lightDir, viewDir, roughness);
    
    // Combine
    vec3 lighting = (diffuse + specular * metallic) * uLightColor * uLightIntensity;
    
    // Ambient
    vec3 ambient = albedo * 0.03 * uAO;
    
    // Final color
    vec3 finalColor = ambient + lighting;
    
    // ========================================================================
    // OUTPUT
    // ========================================================================
    
    fragColor = vec4(finalColor, 1.0);
    
    // For MRT:
    // outColor = vec4(finalColor, 1.0);
    // outNormal = vec4(normal * 0.5 + 0.5, 1.0);
    // outPosition = vec4(vPosition, 1.0);
}

#endif // FRAGMENT_SHADER

// ============================================================================
// COMMON PATTERNS & USAGE NOTES
// ============================================================================

/*
// PATTERN: Simple unlit material (vertex colors)
void main() {
    fragColor = vColor;
}
*/

/*
// PATTERN: Textured with lighting
void main() {
    vec3 albedo = texture(sAlbedoTex, vTexCoord).rgb;
    vec3 normal = normalize(vNormal);
    float NdotL = max(dot(normal, uLightDir), 0.0);
    vec3 color = albedo * NdotL * uLightColor;
    fragColor = vec4(color, 1.0);
}
*/

/*
// PATTERN: World space normals visualization
void main() {
    vec3 normal = normalize(vNormal);
    fragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
*/

/*
// PATTERN: UV visualization
void main() {
    fragColor = vec4(vTexCoord, 0.0, 1.0);
}
*/

/*
// PATTERN: Depth visualization
void main() {
    float depth = gl_FragCoord.z;
    fragColor = vec4(vec3(depth), 1.0);
}
*/

/*
// PATTERN: Vertex displacement (in vertex shader)
void main() {
    vec3 displaced = aPosition + aNormal * sin(uTime + aPosition.y) * 0.1;
    gl_Position = uTDMats[4] * vec4(displaced, 1.0);
    // ... rest of vertex shader
}
*/

// ============================================================================
// SETUP NOTES
// ============================================================================
/*
1. Create GLSL MAT operator
2. Enable "Vertex Shader" and "Fragment Shader" pages
3. Paste vertex code in vertex shader, fragment code in fragment shader
4. Connect material to Render TOP via "Material" parameter
5. Set up geometry input to Render TOP
6. Bind custom uniforms in MAT's uniform parameters
7. Connect textures via material's texture parameters
*/

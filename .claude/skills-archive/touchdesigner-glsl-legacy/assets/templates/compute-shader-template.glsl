// ============================================================================
// TOUCHDESIGNER COMPUTE SHADER TEMPLATE
// ============================================================================
// Template for GLSL Compute TOP - parallel image processing
// GLSL version 430 or higher required
// ============================================================================

#version 430

// ----------------------------------------------------------------------------
// WORK GROUP CONFIGURATION
// ----------------------------------------------------------------------------
// Define work group size (threads per work group)
// Optimal: Use multiples of 32 (warp size on NVIDIA) or 64 (AMD)
// Total threads per group should be 256 or less for compatibility
layout(local_size_x = 16, local_size_y = 16, local_size_z = 1) in;

// This creates work groups of 16x16 = 256 threads
// For 1920x1080 image: 120x68 work groups = 8,160 work groups total

// ----------------------------------------------------------------------------
// IMAGE BINDINGS
// ----------------------------------------------------------------------------
// Input images (readonly)
layout(rgba8, binding = 0) uniform readonly image2D inputImg0;
layout(rgba8, binding = 1) uniform readonly image2D inputImg1;

// Output images (writeonly)
layout(rgba8, binding = 2) uniform writeonly image2D outputImg;

// For read-write (use carefully - can cause race conditions):
// layout(rgba8, binding = 3) uniform image2D feedbackImg;

// Format options:
// rgba8, rgba16f, rgba32f (color)
// r8, r16f, r32f (single channel)
// rg8, rg16f, rg32f (two channel)

// ----------------------------------------------------------------------------
// SHARED MEMORY
// ----------------------------------------------------------------------------
// Shared between threads in the same work group
// Useful for caching and inter-thread communication
// Limited size: typically 48KB per work group

// Example: Cache for 16x16 + 2-pixel border = 18x18
shared vec4 sharedCache[18][18];

// ----------------------------------------------------------------------------
// CUSTOM UNIFORMS
// ----------------------------------------------------------------------------
uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;
uniform int uKernelSize;

// ----------------------------------------------------------------------------
// BUILT-IN VARIABLES
// ----------------------------------------------------------------------------
// gl_GlobalInvocationID: Unique thread ID across all work groups
// gl_LocalInvocationID: Thread ID within current work group (0-15 for 16x16)
// gl_WorkGroupID: Work group ID
// gl_LocalInvocationIndex: Flattened index within work group
// gl_NumWorkGroups: Total number of work groups

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

// Safe image load with bounds checking
vec4 safeLoad(image2D img, ivec2 coord) {
    ivec2 size = imageSize(img);
    if(coord.x < 0 || coord.x >= size.x || coord.y < 0 || coord.y >= size.y) {
        return vec4(0.0);
    }
    return imageLoad(img, coord);
}

// Load to shared memory with padding
void loadToShared(ivec2 globalCoord) {
    ivec2 localID = ivec2(gl_LocalInvocationID.xy);
    
    // Each thread loads its pixel plus padding
    // Load center pixel
    sharedCache[localID.x + 1][localID.y + 1] = imageLoad(inputImg0, globalCoord);
    
    // Load borders (only edge threads do this)
    if(localID.x == 0) {
        sharedCache[0][localID.y + 1] = safeLoad(inputImg0, globalCoord + ivec2(-1, 0));
    }
    if(localID.x == 15) {
        sharedCache[17][localID.y + 1] = safeLoad(inputImg0, globalCoord + ivec2(1, 0));
    }
    if(localID.y == 0) {
        sharedCache[localID.x + 1][0] = safeLoad(inputImg0, globalCoord + ivec2(0, -1));
    }
    if(localID.y == 15) {
        sharedCache[localID.x + 1][17] = safeLoad(inputImg0, globalCoord + ivec2(0, 1));
    }
    
    // Corners
    if(localID.x == 0 && localID.y == 0) {
        sharedCache[0][0] = safeLoad(inputImg0, globalCoord + ivec2(-1, -1));
    }
    // ... other corners
}

// Simple hash for random values
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ----------------------------------------------------------------------------
// PROCESSING FUNCTIONS
// ----------------------------------------------------------------------------

// Example: Box blur using shared memory
vec4 boxBlur(ivec2 localID, int radius) {
    vec4 result = vec4(0.0);
    float count = 0.0;
    
    for(int y = -radius; y <= radius; y++) {
        for(int x = -radius; x <= radius; x++) {
            int sx = localID.x + 1 + x;
            int sy = localID.y + 1 + y;
            result += sharedCache[sx][sy];
            count += 1.0;
        }
    }
    
    return result / count;
}

// Example: Edge detection
vec4 sobelEdgeDetection(ivec2 coord) {
    // Sobel kernels
    float Gx[9] = float[](
        -1, 0, 1,
        -2, 0, 2,
        -1, 0, 1
    );
    
    float Gy[9] = float[](
        -1, -2, -1,
         0,  0,  0,
         1,  2,  1
    );
    
    vec3 sumX = vec3(0.0);
    vec3 sumY = vec3(0.0);
    
    int idx = 0;
    for(int y = -1; y <= 1; y++) {
        for(int x = -1; x <= 1; x++) {
            vec4 sample = safeLoad(inputImg0, coord + ivec2(x, y));
            sumX += sample.rgb * Gx[idx];
            sumY += sample.rgb * Gy[idx];
            idx++;
        }
    }
    
    float magnitude = length(vec2(length(sumX), length(sumY)));
    return vec4(vec3(magnitude), 1.0);
}

// Example: Parallel reduction (find max value)
// Note: This is simplified - real reduction is more complex
shared float sharedMax[256];

float findMaxInWorkGroup(float value) {
    uint idx = gl_LocalInvocationIndex;
    sharedMax[idx] = value;
    
    barrier();
    memoryBarrierShared();
    
    // Tree reduction
    for(uint stride = 128; stride > 0; stride >>= 1) {
        if(idx < stride) {
            sharedMax[idx] = max(sharedMax[idx], sharedMax[idx + stride]);
        }
        barrier();
        memoryBarrierShared();
    }
    
    return sharedMax[0];
}

// ----------------------------------------------------------------------------
// MAIN COMPUTE SHADER
// ----------------------------------------------------------------------------
void main() {
    // Get pixel coordinates
    ivec2 pixelCoord = ivec2(gl_GlobalInvocationID.xy);
    ivec2 localCoord = ivec2(gl_LocalInvocationID.xy);
    
    // Get image dimensions
    ivec2 resolution = imageSize(outputImg);
    
    // Bounds check - early exit if out of range
    if(pixelCoord.x >= resolution.x || pixelCoord.y >= resolution.y) {
        return;
    }
    
    // ========================================================================
    // METHOD 1: Direct processing (no shared memory)
    // ========================================================================
    /*
    // Load input pixel
    vec4 inputColor = imageLoad(inputImg0, pixelCoord);
    
    // Process pixel
    vec4 outputColor = inputColor;
    outputColor.rgb = 1.0 - outputColor.rgb;  // Invert
    
    // Write output
    imageStore(outputImg, pixelCoord, outputColor);
    */
    
    // ========================================================================
    // METHOD 2: Using shared memory for neighborhood operations
    // ========================================================================
    
    // Load data to shared memory
    loadToShared(pixelCoord);
    
    // Synchronize all threads in work group
    barrier();
    memoryBarrierShared();
    
    // Now all threads can access shared data
    vec4 blurred = boxBlur(localCoord, 1);
    
    // Write output
    imageStore(outputImg, pixelCoord, blurred);
    
    
    // ========================================================================
    // METHOD 3: Multi-input processing
    // ========================================================================
    /*
    vec4 input0 = imageLoad(inputImg0, pixelCoord);
    vec4 input1 = imageLoad(inputImg1, pixelCoord);
    vec4 result = mix(input0, input1, uIntensity);
    imageStore(outputImg, pixelCoord, result);
    */
}

// ============================================================================
// COMMON PATTERNS
// ============================================================================

/*
// PATTERN: Image convolution (general kernel)
vec4 convolve(ivec2 coord, float kernel[9]) {
    vec4 result = vec4(0.0);
    int idx = 0;
    for(int y = -1; y <= 1; y++) {
        for(int x = -1; x <= 1; x++) {
            vec4 sample = safeLoad(inputImg0, coord + ivec2(x, y));
            result += sample * kernel[idx];
            idx++;
        }
    }
    return result;
}
*/

/*
// PATTERN: Parallel prefix sum (scan)
shared float prefixSum[256];

void parallelScan() {
    uint idx = gl_LocalInvocationIndex;
    
    // Up-sweep phase
    for(uint stride = 1; stride < 256; stride *= 2) {
        if(idx % (stride * 2) == 0) {
            prefixSum[idx + stride * 2 - 1] += prefixSum[idx + stride - 1];
        }
        barrier();
        memoryBarrierShared();
    }
    
    // Down-sweep phase
    // ... (implementation continues)
}
*/

/*
// PATTERN: Random noise generation
void main() {
    ivec2 coord = ivec2(gl_GlobalInvocationID.xy);
    float noise = hash(vec2(coord) + uTime);
    imageStore(outputImg, coord, vec4(vec3(noise), 1.0));
}
*/

/*
// PATTERN: Image analysis (histogram)
shared uint histogram[256];

void computeHistogram() {
    uint idx = gl_LocalInvocationIndex;
    
    // Initialize histogram
    if(idx < 256) {
        histogram[idx] = 0;
    }
    barrier();
    memoryBarrierShared();
    
    // Sample and update histogram
    ivec2 coord = ivec2(gl_GlobalInvocationID.xy);
    vec4 color = imageLoad(inputImg0, coord);
    uint bin = uint(color.r * 255.0);
    atomicAdd(histogram[bin], 1);
    
    barrier();
    memoryBarrierShared();
    
    // Now histogram contains counts for this work group
}
*/

// ============================================================================
// PERFORMANCE NOTES
// ============================================================================
/*
1. Work group size:
   - Use 256 threads or less (16x16, 32x8, etc.)
   - Must divide image dimensions evenly, or handle edge cases
   
2. Memory coalescing:
   - Access adjacent pixels in adjacent threads for best performance
   - Sequential access pattern: thread N reads pixel N
   
3. Shared memory:
   - Limited to ~48KB per work group
   - Fast, but requires synchronization (barrier())
   - Use for neighborhood operations (blur, convolution)
   
4. Synchronization:
   - barrier(): Wait for all threads in work group
   - memoryBarrierShared(): Ensure shared memory is visible
   - memoryBarrierImage(): Ensure image writes are visible
   
5. Atomic operations:
   - atomicAdd(), atomicMax(), etc.
   - Slower than regular operations
   - Use for histograms, reductions
   
6. Branching:
   - Minimize divergent branches within work group
   - All threads in warp should take same path when possible
*/

// ============================================================================
// SETUP IN TOUCHDESIGNER
// ============================================================================
/*
1. Create GLSL Compute TOP
2. Set resolution to match input/output requirements
3. Paste shader code in compute shader page
4. Bind uniforms in uniform parameters
5. Connect input TOPs to image inputs
6. Set work group size: Resolution / local_size
   - For 1920x1080 with local_size 16x16:
   - Work groups: 120 x 68
   - TD calculates this automatically
7. For multi-pass: chain multiple Compute TOPs
*/

/* 
    MIT License
    Author: Fred Kyung-jin Rezeau <fred@litemint.com>, 2024
    Permission is granted to use, copy, modify, and distribute this software for any purpose
    with or without fee.
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
*/

#if CL_TARGET_OPENCL_VERSION >= 200
#pragma OPENCL EXTENSION cl_khr_int64_base_atomics : enable
typedef atomic_int atomic_int_t;
#define load(p) atomic_load(p)
#else
typedef int atomic_int_t;
inline int load(__global volatile int *p) { return atomic_cmpxchg(p, 0, 0); }
// Uncomment to use volatile load fallback if performance impact is significant.
// #define load(p) (*(volatile __global int*)(p))
#endif

#define maxDataSize 256

void keccak256(const uchar* input, size_t size, uchar* output);  // See utils/keccak.cl (concatenated at runtime).

inline void updateNonce(ulong val, uchar* buffer) {
    for (int i = 0; i < 8; i++) {
        buffer[7 - i] = (uchar)((val >> (i * 8)) & 0xFF);
    }
}

inline int check(const uchar* hash, int difficulty) {
    int zeros = 0;
    for (int i = 0; i < 32; ++i) {
        // Optimized difficulty check by avoiding branching.
        int zero = -(hash[i] == 0);
        zeros += (zero & 2) | (~zero & ((-((hash[i] >> 4) == 0)) & 1));
        i += ((hash[i] != 0 || zeros >= difficulty) ? (32 - i) : 0);
    }
    return zeros == difficulty;
}

inline void copy(uchar* dest, const __global uchar* src, int size) {
    for (int i = 0; i < size; ++i) {
        dest[i] = src[i]; // TODO: optimize with vectorized copy.
    }
}

__kernel void run(int dataSize, ulong startNonce, int nonceOffset, ulong batchSize, int difficulty,
    __global const uchar* deviceData, __global atomic_int_t* found, __global uchar* output, __global ulong* validNonce
) {
    ulong idx = get_global_id(0);
    ulong stride = get_global_size(0);
    if (dataSize > maxDataSize || idx >= batchSize || load(found) == 1)
        return;
    ulong nonceEnd = startNonce + batchSize;
    uchar threadData[maxDataSize];
    copy(threadData, deviceData, dataSize);

    // Nonce distribution is based on thread id - spaced by stride.
    for (ulong nonce = startNonce + idx; nonce < nonceEnd; nonce += stride) {
        updateNonce(nonce, &threadData[nonceOffset]);
        uchar hash[32];
        keccak256(threadData, dataSize, hash);
        if (check(hash, difficulty)) {
            if (atomic_cmpxchg((volatile __global int*)found, 0, 1) == 0) {
                for (int i = 0; i < 32; ++i) {
                    output[i] = hash[i];
                }
                *validNonce = nonce;
            }
            return;
        }
        if (load(found) == 1)
            return;
    }
}

# kale-miner

## CPU/GPU miner for [The KALEpail Project](https://github.com/kalepail/KALE-sc)

`kale-miner` is a CPU/GPU miner written in C++ for the [The KALEpail Project](https://github.com/kalepail/KALE-sc) on the Stellar blockchain. It supports **CPU parallel processing**, and **GPU acceleration with CUDA** (OpenCL to be added soon).

> **Note**: Windows compilation is not supported in this update, a bit more work is needed for portable 128 integer types. In the meantime, I recommend you use **WSL** to compile the project on Windows.

## Performance

### CPU Performance

Tested with **Intel Core i9-14900K @ 3.20 GHz** processor (24 cores), the miner achieved an **average hash rate of 35 MH/s**.

### GPU Performance

With GPU acceleration enabled on an **NVIDIA GeForce RTX 4080** GPU, the miner achieved an average hash rate of **1.9 GH/s** (CUDA).

| GPU           | Framework | Avg. Hash Rate |
|---------------------|-----------|-------------------|
| NVIDIA GeForce RTX 4080 | CUDA      | ~1.9 GH/s     |
| NVIDIA GeForce RTX 4080 | OPENCL      | TBD     |

### Keccak Hashing

You may want to explore more keccak implementations here [keccak.team/software](https://keccak.team/software.html) for potential performance improvements (note that the standalone [XKCP implementation](https://github.com/XKCP/XKCP/blob/master/Standalone/CompactFIPS202/C/Keccak-more-compact.c) was much slower in my environment).

## Requirements

- **C++17** or higher
- **C++ Standard Library** (no additional dependencies required)
  
### GPU Build (CUDA)

- **NVIDIA CUDA-Capable GPU** with compute capability 3.0 or higher
- [**NVIDIA CUDA Toolkit**](https://developer.nvidia.com/cuda-toolkit)

## Compilation

### CPU-Only Compilation

To compile the miner without GPU support, simply run:

```bash
make clean
make
```

### GPU-Enabled Compilation

To compile the miner with GPU support, run:

```bash
make clean
make GPU=CUDA
```

## Usage

```bash
./miner <block> <hash> <nonce> <difficulty> <miner_address> [--verbose] [--max-threads <num> (default 4)] [--batch-size <size> (default 10000000)]
```

### Parameters

| Parameter              | Description                                                    | Default Value     |
|------------------------|----------------------------------------------------------------|-------------------|
| `<block>`              | The block number.                                | _(Required)_      |
| `<hash>`               | Previous hash value (base64 encoded).                          | _(Required)_      |
| `<nonce>`              | Starting nonce value.                                          | _(Required)_      |
| `<difficulty>`         | The mining difficulty level.                                   | _(Required)_      |
| `<miner_address>`      | `G` address for reward distribution. Must have KALE trustline. | _(Required)_      |
| `[--verbose]`            | Verbose mode incl. hash rate monitoring                      | Disabled          |
| `[--max-threads <num>]`  | Specifies the maximum number of threads (CPU) or threads per block (GPU).              | 4                |
| `[--batch-size <size>]`  | Number of hash attempts per batch.                           | 10000000         |
| `[--gpu]`  | Enable GPU mining                           | Disabled          |
| `[--device]`  | Specify the device id                           | 0          |

Example:
```bash
./miner 37 AAAAAAn66y/43JP7M02rwTmONZoWOmu1OPYz/bmzJ8o= 13391834480 8 GBQHTQ7NTSKHVTSVM6EHUO3TU4P4BK2TAAII25V2TT2Q6OWXUJWEKALE --max-threads 24 --batch-size 10000000 --verbose
```

Should output:
```json
{
  "hash": "00000000d60a45d3b6c17d3e45a9e5b14014784961876fe240042f985da91eeb",
  "nonce": 13391834489
}
```

> ⚠️ IMPORTANT: When using `--gpu`, the `--max-threads` parameter specifies the number of threads per block (e.g. 512, 768), and --batch-size should be adjusted based on your GPU capabilities.

## Getting Started

The `homestead` folder contains a Node.js application designed to simplify the KALE farming cycle with the **C++ CPU/GPU miner**. It automates `monitoring` new blocks, `planting`, `working`, and `harvesting`, and can manage multiple farmer accounts to help you maximize your CPU/GPU utilization.

### Spin Up the Homestead Server

Open `homestead/config.json` to configure your server settings.

> 💡PRO TIP: Add as many farmers as you like! Their tasks will run one after the other, and you can tweak individual difficulty to maximize CPU/GPU occupancy during the 5-minute block window.

> 💡PRO TIP: Keep only a minimal amount of XLM in your farmer accounts. These projects are experimental, network updates (e.g., reduced block time) could quickly drain your balances

```json
{
    // You can add as many farmers as you want in this array. Each farmer's work will be scheduled sequentially.
    // You can adjust individual difficulty and stake settings to optimize CPU/GPU usage
    // for the 5-minute mining window.
    "farmers": [
        {
            // Secret key for the farmer account.
            // The harvesting process will automatically add a KALE trustline if not set.
            "secret": "SECRET...KEY",
            // Specify the stake, starting with 0 for new accounts.
            "stake": 0,
            // Optional. Adjust based on your CPU/GPU power.
            "difficulty": 6
        }
    ],
    // Tune these settings according to your system’s performance.
    "miner": {
        "executable": "../miner",
        // Default difficulty for all farmers, unless overridden.
        "difficulty": 6,
        // Initial nonce.
        "nonce": 0,
        // Enable GPU mining (NVIDIA CUDA).
        "gpu": false,
        // For CPU mining, `max_threads` should be set within the range of your available CPU cores.
        // For GPU mining, `max_threads` refers to the number of threads per block.
        "maxThreads": 4,
        // Number of hashes processed in a single batch.
        "batchSize": 10000000,
        // For GPU mining, specify the device ID (default 0).
        "device": 0,
        // Enable real-time miner output.
        "verbose": true
    },
    "stellar": {
        // Stellar RPC URL, or use the environment variable RPC_URL.
        "rpc": "your-stellar-rpc-url",
        // KALE contract ID.
        "contract": "CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA",
        // KALE asset issuer.
        "assetIssuer": "GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE",
        // KALE asset code.
        "assetCode": "KALE"
    }
}
```

Then run the following commands to start the server:

```bash
cd homestead
npm install
PORT=3001 RPC_URL="https://your-rpc-url" npm start
```

### Homestead Server API (Advanced Users)

The Homestead server provides several API endpoints to allow manual interactions with the KALE farming process, including `/plant`, `/work`, `/harvest`, `/data` and `/balances`. Feel free to use these endpoints to experiment with individual steps in the farming cycle.

Open `homestead/routes.js` for more details.

## Disclaimer

This software is experimental and provided "as-is," without warranties or guarantees of any kind. Use it at your own risk. Please ensure you understand the risks mining on Stellar mainnet before deploying this software.

## License

[MIT License](LICENSE)




# kale-miner

## CPU/GPU Miner for KALE

`kale-miner` is a CPU/GPU miner written in C++ for [KALE](https://stellar.expert/explorer/public/contract/CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV) on the [Stellar](https://stellar.org/) blockchain. It supports **CPU parallel processing**, and **GPU acceleration with CUDA or OpenCL**.

Learn more about KALE:
- [The KALEpail Project](https://github.com/kalepail/KALE-sc) by [kalepail](https://github.com/kalepail)
- [KALE Fan Fiction Lore](https://kalepail.com/kale/kale-chapter-1) by [briwylde08](https://github.com/briwylde08)

## Performance

### CPU Performance

Tested with **Intel Core i9-14900K @ 3.20 GHz** processor (24 cores), the miner achieved an **average hash rate of 35 MH/s**.

### GPU Performance

With GPU acceleration enabled on an **NVIDIA GeForce RTX 4080** GPU, the miner achieved an average hash rate of **1.9 GH/s** (CUDA).

| GPU           | Framework | Avg. Hash Rate |
|---------------------|-----------|-------------------|
| NVIDIA GeForce RTX 4080 | CUDA      | ~1.9 GH/s     |
| NVIDIA GeForce RTX 4080 | OPENCL      | ~1.3 GH/s     |

### Keccak Hashing

You may want to explore more keccak implementations here [keccak.team/software](https://keccak.team/software.html) for potential performance improvements (note that the standalone [XKCP implementation](https://github.com/XKCP/XKCP/blob/master/Standalone/CompactFIPS202/C/Keccak-more-compact.c) was much slower in my environment).

## Requirements

- **C++17** or higher
- **C++ Standard Library** (no additional dependencies required)
  
### GPU Build (CUDA)

- **NVIDIA CUDA-Capable GPU** with compute capability 3.0 or higher
- [**NVIDIA CUDA Toolkit**](https://developer.nvidia.com/cuda-toolkit)

### GPU Build (OpenCL)

- **OpenCL 3.0** or higher
- **OpenCL SDK**
  - for NVIDIA: [NVIDIA CUDA Toolkit (includes OpenCL)](https://developer.nvidia.com/cuda-toolkit)
  - for AMD: [AMD SDK (supports OpenCL)](https://developer.amd.com/tools-and-sdks/)
  - for Intel: [Intel SDK for OpenCL](http://software.intel.com/en-us/vcsource/tools/opencl-sdk)

## Compilation

### CPU-Only Compilation

To compile the miner without GPU support, simply run:

```bash
make clean
make
```

### GPU-Enabled Compilation

To compile the miner with GPU support, run:

CUDA:

```bash
make clean
make GPU=CUDA
```

or OpenCL:

```bash
make clean
make GPU=OPENCL
```

Note: The current OpenCL implementation uses the `cl_khr_int64_base_atomics` extension for atomic operations on 64-bit integers. Make sure your device supports it.

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
./miner 37 AAAAAAn66y/43JP7M02rwTmONZoWOmu1OPYz/bmzJ8o= 20495217909 8 GBQHTQ7NTSKHVTSVM6EHUO3TU4P4BK2TAAII25V2TT2Q6OWXUJWEKALE --max-threads 4 --batch-size 10000000 --verbose
```

Should output:
```json
{
  "hash": "0000000099be0037e5a48324959cb9dd10965ae59511cfd1996f9b917aad9980",
  "nonce": 20495217910
}
```

> ⚠️ IMPORTANT: When using `--gpu`, the `--max-threads` parameter specifies the number of threads per block (e.g. 512, 768), and --batch-size should be adjusted based on your GPU capabilities.

## Getting Started

The `homestead` folder contains a Node.js application designed to simplify the KALE farming cycle with the **C++ CPU/GPU miner**. It automates `monitoring` new blocks, `planting`, `working`, and `harvesting`, and can manage multiple farmer accounts to help you maximize your CPU/GPU utilization.

### Spin Up the Homestead Server

Open `homestead/config.json` to configure your server settings.

> 💡PRO TIP: Add as many farmers as you like! Their tasks will run one after the other, and you can tweak individual difficulty to maximize CPU/GPU occupancy during the 5-minute block window.

> 💡PRO TIP: Keep only a minimal amount of XLM in your farmer accounts. These projects are experimental, network updates (e.g., reduced block time) could quickly drain your balances

```js
{
    // You can add as many farmers as you want in this array. Each farmer's work will be scheduled sequentially.
    // Adjust individual difficulty and stake settings directly, or use strategy.js to implement a dynamic strategy.
    "farmers": [
        {
            // Secret key for the farmer account.
            // The harvesting process will automatically add a KALE trustline if not set.
            "secret": "SECRET...KEY",
            // Specify the stake, starting with 0 for new accounts.
            "stake": 0,
            // Optional. Adjust based on your CPU/GPU power.
            "difficulty": 6,
            // Optional: Defines the minimum time (in seconds) before work is submitted
            // to the contract (default is 0 for immediate submission).
            "minWorkTime": 0,
            // Optional: Set the miner to only harvest the previous block if work was submitted.
            "harvestOnly": false
        }
    ],
    "harvester": {
        // Optional: Secret key for the harvester account.
        "account" : "SECRET...KEY",
        // Optional: Harvesting delay, recommended to avoid failures due to network congestion.
        "delay": 60,
        // Optional: String representing a block range to check for harvest at startup.
        // - absolute range: "start-end" (e.g., "10-15" to check blocks 10 through 15)
        // - relative range: "-count" (e.g., "-5" to check 5 blocks from the penultimate block)
        "range": "-1",
        // Optional: Set ALL miners to only harvest the previous block if work was submitted.
        // Overrides farmer settings if true.
        "harvestOnly": false,
        // Optional: Specifies the number of retry for failed harvest due to contract error.
        "retryCount": 3
    },
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
        // Optional. Fee settings for transactions (default 10000000).
        "fees": 10000000,
        // Optional. Output transaction response (default false).
        "debug": false,
        // Optional. If both a valid token and URL are provided,
        // Launchtube credits will be used to submit contract invocation transactions.
        "launchtube": {
            "url": "https://launchtube.xyz",
            "token": "eyJ0eX...uQQa5WlP08"
        }
    }
}
```

Then run the following commands to start the server:

```bash
cd homestead
npm install
PORT=3001 RPC_URL="https://your-rpc-url" npm start
```

### Crop Monitor: Track Your Harvest in Real Time

Keep an eye on your harvest and farmers' activity in real time with the **Crop Monitor**.

Follow these steps to get it up and running (ensure you adjust the `PORT` to match your homestead server configuration):

```bash
cd cropmonitor
npm install
PORT=3001 npm start
```

### Dynamic Farming Strategy (Advanced Users)

Farming KALE most efficiently requires dynamically adjusting your farmers parameters. The [`strategy.js`](https://github.com/FredericRezeau/kale-miner/blob/main/homestead/strategy.js) module enables you to define the `stake`, `difficulty`, and `minWorkTime` for each farmer based on real-time conditions.

Below is an example of a dynamic strategy that implements the following:

- `plant` stakes 10% of the farmer KALE balance (up to a maximum of 10 KALE).
- Sets difficulty to the previous block difficulty + 1 (capped at 9 for safety).
- Ensures a minimum `work` time of 3 minutes before submission.

```js
const config = require(process.env.CONFIG || './config.json');
const { horizon } = require('./contract');

module.exports = {
    stake: async(publicKey, _blockData) => {
        const asset = (await horizon.loadAccount(publicKey)).balances.find(
            balance => balance.asset_code === config.stellar.assetCode && balance.asset_issuer === config.stellar.assetIssuer);
        return Math.min(Math.floor(Number(asset?.balance || 0) * 1000000), 100000000);
    },

    difficulty: async(_publicKey, blockData) => {
        return Math.min(Buffer.from(blockData.hash, 'base64').reduce(
            (zeros, byte) => zeros + (byte === 0 ? 2 : (byte >> 4) === 0 ? 1 : 0), 0) + 1, 9);
    },

    minWorkTime: async(_publicKey, _blockData) => {
        return 180;
    }
};
```


### Homestead Server API (Advanced Users)

The Homestead server provides several API endpoints to allow manual interactions with the KALE farming process, including `/plant`, `/work`, `/harvest`, `/data`, `/balances` and `/shader` (serving the [WebGPU compute shader](https://github.com/FredericRezeau/kale-miner/blob/main/utils/keccak.wgsl)). Feel free to use these endpoints to experiment with individual steps in the farming cycle.

Open `homestead/routes.js` for more details.

## Disclaimer

This software is experimental and provided "as-is," without warranties or guarantees of any kind. Use it at your own risk. Please ensure you understand the risks mining on Stellar mainnet before deploying this software.

## License

[MIT License](LICENSE)




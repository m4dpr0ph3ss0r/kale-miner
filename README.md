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

IMPORTANT: When using `--gpu`, the `--max-threads` parameter specifies the number of threads per block (e.g. 512, 768), and --batch-size should be adjusted based on your GPU capabilities.

## Getting Started

The `sample-scripts` folder contains scripts from my current setup, shared here to help you set up your environment or serve as inspiration. They automate the entire KALE farming process including `planting`, `working` and `harvesting`.

| Script              | Description                                                                      |
|---------------------|----------------------------------------------------------------------------------|
| **homestead.js**       | Node.js server monitoring blockchain updates, and providing endpoints to `plant` and submit `work` with automated `harvest`. |
| **poll.sh**         | Bash script to manage miner instances and poll the homestead server for work.               |
| **mine.sh**         | Bash script running the miner instance.           |


### Spin up the Homestead server

Configure your miners secret keys in `homestead.js`.
You can specify as many as you want, only miners in this list can successfully call the homestead endpoints.

```js
const secrets  = [
    'SECRET...KEY1'
];
```

Then run the following to set up and start the server:

```bash
cd sample-scripts
npm install
PORT=3001 RPC_URL="https://your-rpc-url" npm start
```

### Configure the scripts

You can configure the following variables in `poll.sh` to customize the setup for your environment:

```bash
# Poller url.
endpoint="http://localhost:3001"

# Stake amount (new miners should start with 0).
stake_amount=0

# Difficulty level (adjust based on your CPU capabilities).
difficulty=6

# Specify valid miner Stellar address(es).
miners=(
    "GBQHTQ7NTS...6OWXUJWEKALE"
)
```

Edit the following variables in `mine.sh` to customize the setup for your environment:

```bash
# Poller url.
endpoint="http://localhost:3001"

# Starting nonce.
nonce=0

# GPU mode.
gpu=false

# Max threads or threads per block (GPU)
max_threads=4

# Batch size.
batch_size=10000000

# Verbose.
verbose=true
```

#### Some notes on `max_threads` and `batch_size`

- For CPU mining, `max_threads` should be set within the range of your available CPU cores.
- For GPU mining, `max_threads` refers to the number of threads per block. It should be a multiple of the warp size (32) so using 256, 512, 768 is generally recommended.
- The `batch_size` parameter determines the number of hashes processed in a single batch. Should be set based on your CPU or GPU performance, balance to minimize overhead and maximizing throughput.

### Start mining

To begin mining, run the poller script with:

```bash
cd sample-scripts
./poll.sh
```

If you have multiple GPUs, you can run each of them in seperate terminals using `./poll.sh {n}`

## Disclaimer

This software is experimental and provided "as-is," without warranties or guarantees of any kind. Use it at your own risk. Please ensure you understand the risks mining on Stellar mainnet before deploying this software.

## License

[MIT License](LICENSE)




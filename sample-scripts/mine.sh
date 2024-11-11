#!/bin/bash

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

# Miner Stellar address (trustline to KALE required).
miner=${1}

# Difficulty (optional, default to 6)
difficulty=${2:-6}

#device ordinal (optional, default to 0)
device=${3:-0}

if [ -z "$miner" ]; then
    echo "Error: Miner address required."
    exit 1
fi

miner_cmd=("../miner")
data_endpoint="${endpoint}/data"
work_endpoint="${endpoint}/work"
response=$(curl -s "$data_endpoint")
hash=$(echo "$response" | sed -n 's/.*"hash":"\([^"]*\)".*/\1/p')
block=$(echo "$response" | sed -n 's/.*"block":\([0-9]*\).*/\1/p')

# Run miner.
miner_cmd+=("$block" "$hash" "$nonce" "$difficulty" "$miner")
if $verbose; then
    miner_cmd+=("--verbose")
fi
miner_cmd+=("--max-threads" "$max_threads" "--batch-size" "$batch_size" "--device" "$device")
if $gpu; then
    miner_cmd+=("--gpu")
fi
echo "Running miner with hash=$hash, block=$block, difficulty=$difficulty, address=$miner, gpu=$gpu"
if $verbose; then
    output=$(exec -a "farmer_$device" "${miner_cmd[@]}" | tee /dev/tty)
else
    output=$(exec -a "farmer_$device" "${miner_cmd[@]}")
fi

# Retrieve hash and nonce.
mined_hash=$(echo "$output" | grep -oP '"hash": "\K[^"]+')
mined_nonce=$(echo "$output" | grep -oP '"nonce": \K\d+')
if [ -z "$mined_hash" ] || [ -z "$mined_nonce" ]; then
    exit 1
fi

# Submit to network.
submit_url="${work_endpoint}?hash=${mined_hash}&nonce=${mined_nonce}&farmer=${miner}"
echo "Submitting work $submit_url"
response=$(curl -s "$submit_url")
result=$(echo "$response" | grep -oP '"result":\s*\{.*\}')
if [ -n "$result" ]; then
    echo "Work success for $miner, nonce $mined_nonce, hash=$mined_hash"
else
    echo "Work failed for $miner, nonce $mined_nonce, hash=$mined_hash"
fi
#!/bin/bash

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

# Device ordinal parameter (default 0).
device=${1:-0}

mining_script="./mine.sh"
poll_interval=2
last_block=""
process_name="farmer_$device"
current_miner_index=0
data_endpoint="${endpoint}/data"
plant_endpoint="${endpoint}/plant"
loop_counter=0

shuffle() {
    for ((i=${#miners[@]}-1; i>0; i--)); do
        j=$((RANDOM % (i+1)))
        temp="${miners[i]}"
        miners[i]="${miners[j]}"
        miners[j]="$temp"
    done
}

while true; do
    loop_counter=$(( (loop_counter + 1) % 6 ))
    current_data=$(curl -s "$data_endpoint")
    if [ -z "$current_data" ]; then
        echo "Failed to retrieve data. Retrying..."
        sleep "$poll_interval"
        continue
    fi

    current_block=$(echo "$current_data" | sed -n 's/.*"block":\([0-9]*\).*/\1/p')
    if [[ "$current_block" != "$last_block" ]]; then
        echo "New block detected: $new_block"
        last_block="$current_block"
        current_miner_index=0
        shuffle
    fi

    if [ $loop_counter -eq 0 ]; then
        echo "Poller running [$process_name]"
        for miner_address in "${miners[@]}"; do
            plant_url="${plant_endpoint}?farmer=${miner_address}&amount=${stake_amount}"
            response=$(curl -s "$plant_url")
            result=$(echo "$response" | grep -oP '"result":\s*\{.*\}')
            if [ -n "$result" ]; then
                echo "Plant success for $miner_address [amount $stake_amount]"
            fi
        done
    fi

    if ! pgrep -f "$process_name" > /dev/null; then
        if [ "$current_miner_index" -lt "${#miners[@]}" ]; then
            miner="${miners[$current_miner_index]}"
            block=$(echo "$current_data" | sed -n 's/.*"block":\([0-9]*\).*/\1/p')
            pkill -f "$process_name"
            bash "$mining_script" "$miner" "$difficulty" "$device" &
            current_miner_index=$((current_miner_index + 1))
        fi
    fi
    sleep "$poll_interval"
done

import { Glicko2 } from 'glicko2';
const {
    MaxPriorityQueue,
} = require('@datastructures-js/priority-queue');
const yaml = require('js-yaml');
const fs = require('fs').promises;

const readline = require('node:readline/promises');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export async function readYamlFile(filePath) {
    const fileData = await fs.readFile(filePath, 'utf-8');
    return yaml.load(fileData);
}

const INIT_R = 1500;

const ranking = new Glicko2({
    // tau : "Reasonable choices are between 0.3 and 1.2, though the system should
    //      be tested to decide which value results in greatest predictive accuracy."
    // If not set, default value is 0.5
    tau: 0.5,

    // rating : default rating
    // If not set, default value is 1500
    rating: INIT_R,

    // rd : Default rating deviation
    //     small number = good confidence on the rating accuracy
    // If not set, default value is 350
    rd: 200,

    // vol : Default volatility (expected fluctation on the player rating)
    // If not set, default value is 0.06
    vol: 0.06,
});

function findMinIndex(arr, func) {
    if (arr.length === 0) {
        return -1;
    }

    let minValue = func(arr[0]);
    let minIndex = 0;

    for (let i = 1; i < arr.length; i++) {
        const value = func(arr[i]);
        if (value < minValue) {
            minValue = value;
            minIndex = i;
        }
    }

    return minIndex;
}

function popMinValue(arr, func) {
    const minIndex = findMinIndex(arr, func);
    if (minIndex === -1) {
        return null; // Return null if array is empty
    }
    return arr.splice(minIndex, 1)[0]; // Remove and return the minimum value
}

async function main() {
    const playerNames = process.argv.slice(2);
    const players: Record<string, any> = [];
    for (const name of playerNames) {
        players[name] = ranking.makePlayer(INIT_R);
    }
    const matches: string[][] = [];
    for (let i=0; i < playerNames.length; i++) {
        for (let j=0; j < i; j++) {
            matches.push([playerNames[i], playerNames[j]]);
        }
    }
    while (!matches.length) {
        const [left, right] = popMinValue(matches, (match) => players[match[0]].getRd() ** 2 + players[match[1]].getRd() ** 2);
        const leftPlayer = players[left];
        const rightPlayer = players[right];
        console.log(leftPlayer.predict(rightPlayer));
        const answer = await rl.question(`Which item do you prefer? (1 for '${left}', 2 for '${right}', 0 for tie):`);
        const score = {1: 1, 2: 0, 0: .5}[answer];
        ranking.updateRatings([[leftPlayer, rightPlayer, score]]);
    }
}
main();
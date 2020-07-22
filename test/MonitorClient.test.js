const assert = require('assert');
const lib = require('../MonitorClient.js');
const express = require('express');
const ws = express();
const server = ws.listen(63101);

const ETHAddress = "0x0000000000000000000000000000000000000000";
const A1 = "0x0000000000000000000000000000000000000001";
const A2 = "0x0000000000000000000000000000000000000002";
const C0 = "0x0000000000000000000000000000000000000003";

const transactions = {};
const operations = {};

let blockNumber = 1000;

const options = {
    interval: 1,
    network: 'custom',
    api: 'http://127.0.0.1:63101',
    monitor: 'http://127.0.0.1:63101',
    maxErrorCount: 3
};

let savedState = {};

describe('MonitorClient test', () => {
    before(() => {
        ws.route(`/getTokenInfo/${ETHAddress}`)
            .get((req, res) => res.json({
                address: ETHAddress,
                name: "Ethereum",
                symbol: "ETH",
                decimals: 18,
                price: {
                    rate: 300
                }
            }));

        ws.route(`/getTokenInfo/${C0}`)
            .get((req, res) => {
                res.json({
                    address: C0,
                    name: "Token",
                    symbol: "TKN",
                    decimals: 4,
                    price: {
                        rate: 100
                    }
                });
            });

        ws.route("/getPoolLastOperations/poolId")
            .get((req, res) => {
                res.json(operations);
            });

        ws.route("/getPoolLastTransactions/poolId")
            .get((req, res) => {
                res.json(transactions);
            });
    });

    after(() => server.close());

    it('getTokenInfo should return correct ETH data', async () => {
        const mon = new lib('apiKey', 'poolId', options);
        const data = await mon.getToken(ETHAddress);
        assert.equal(data.name, "Ethereum");
        assert.equal(data.symbol, "ETH");
        assert.equal(data.decimals, 18);
        assert.equal(data.rate, 300);
        delete mon;
    });   

    it('watch() should fire the watched, data, stateChanged and unwatch events', (done) => {
        addNextBlockTx(A1, A2, C0, 1000, 1.5);
        const mon = new lib('apiKey', 'poolId', options);
        mon.on("watched", () => {
            assert.equal(true, true);
        });
        mon.on("data", (eventData) => {          
            assert.equal(eventData.address, A1);
            assert.equal(eventData.data.blockNumber, 1000);
            assert.equal(eventData.data.hash, '1000');
            if (eventData.type === 'transaction') {
                assert.equal(eventData.data.rate, 300);
                assert.equal(eventData.data.usdValue, 450);
            }
            if (eventData.type === 'operation') {
                assert.equal(eventData.data.token.rate, 100);
                assert.equal(eventData.data.rawValue, 1000);
                assert.equal(eventData.data.value, 0.1);
                assert.equal(eventData.data.usdValue, 10);
            }
        });
        mon.on("stateChanged", async (state) => {
            assert.equal(state.lastBlock, 1000);
            assert.equal(state.blocks['1000'], true);
            savedState = await mon.saveState();
            mon.unwatch();
        });
        mon.on("unwatched", () => {
            assert.equal(true, true);
            delete mon;
            done();
        });
        mon.watch();
    });

    it('should restore the saved state', (done) => {
        addNextBlockTx(A1, A2, C0, 500, 1);
        const mon = new lib('apiKey', 'poolId', options);
        mon.restoreState(savedState);
        mon.on("data", (eventData) => {
            assert.equal(eventData.address, A1);
            assert.equal(eventData.data.blockNumber, 1001);
            assert.equal(eventData.data.hash, '1001');
        });
        mon.on("stateChanged", (state) => {
            assert.equal(state.lastBlock, 1001);
            assert.equal(state.blocks['1000'], true);
            assert.equal(state.blocks['1001'], true);
            mon.unwatch();
            done();
        });
        mon.watch();
    });


    it('should unwatch after maxErrorCount errors', (done) => {
        addNextBlockTx(A1, A2, C0, 500, 1);
        const mon = new lib('apiKey', 'badPoolId', options);
        mon.on("unwatched", () => {
            assert.equal(mon.errors, 3);
            delete mon;
            done();
        });
        mon.watch();
    });
});



function addNextBlockTx(from, to, contract, value, valueETH) {
    if (operations[from] === undefined) {
        operations[from] = [];
    }
    if (transactions[from] === undefined) {
        transactions[from] = [];
    }
    const op = {
        timestamp: Date.now(),
        blockNumber,
        contract,
        value,
        type: "transfer",
        priority: 0,
        from,
        to,
        hash: blockNumber.toString(),
        balances: {}
    };

    op.balances[from] = 10000;
    op.balances[to] = 10000;

    operations[from].push(op);

    const tx = {
        timestamp: Date.now(),
        blockNumber: blockNumber,
        from: from,
        to: contract,
        hash: blockNumber.toString(),
        value: valueETH,
        input: "0xa9059cbb",
        balances: {},
        success: true
    };

    tx.balances[from] = 10000;
    tx.balances[contract] = 10000;

    transactions[from].push(tx);

    blockNumber++;
}
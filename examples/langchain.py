# pip install "x402[evm,httpx]" langchain-core eth-account
import os, json, httpx
from eth_account import Account
from x402 import x402Client
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm.exact import register_exact_evm_client
from x402.mechanisms.evm.signers import EthAccountSigner
from langchain_core.tools import tool

BASE = "https://agentshield.live"
x402 = x402Client()
register_exact_evm_client(x402, EthAccountSigner(Account.from_key(os.environ["X402_PAYER_KEY"])), networks="eip155:8453")

@tool
async def check_iban(iban: str) -> dict:
    """Check an IBAN (checksum, length, country format) before money moves."""
    async with x402HttpxClient(x402) as c:   # pays the 402 automatically, 0.005 USDC
        return (await c.get(f"{BASE}/iban", params={"iban": iban})).json()

@tool
async def choose_route(task: str) -> dict:
    """Free. Is this subtask worth paying for? Returns pay, compute or skip."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{BASE}/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "choose_route", "arguments": {"task": task}}})
        return json.loads(r.json()["result"]["content"][0]["text"])

# tools = [choose_route, check_iban]  -> pass to your LangChain / LangGraph / CrewAI agent

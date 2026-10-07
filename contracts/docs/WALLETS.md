# Mainnet wallets

These wallets are for **BNB Chain mainnet (chain id 56)** and **Base mainnet (chain id 8453)**. Sending funds here spends real BNB and ETH.

Private keys are in `.env` and must not be committed. This page lists addresses only.

Prices used on 28 Sep 2026: BNB $757.59, ETH $2,661.44.

| Role | Address | What it's used for | Fund on BNB Chain | Fund on Base |
| --- | --- | --- | --- | --- |
| DEPLOYER | `0x59Fdc93a6add3f79981Cda4aB3791c4b33679845` | Deploys VulnerableVault, Guardian, and MockMixer | 0.013200 BNB (about $10) | 0.003757 ETH (about $10) |
| VAULT_ADMIN | `0xdbaa08367bdB5C3941E62cB437C970B9B8a1484F` | Grants PAUSER_ROLE, allowlists demo wallets, seeds the vault, unpauses, and later calls rescue() | 0.019800 BNB (about $5 gas + $10 seed) | 0.005636 ETH (about $5 gas + $10 seed) |
| USER | `0x8299091075fafce1F6096495197d92D28870cf44` | Normal deposit and the control-case withdrawAll() | 0.003960 BNB (about $3) | 0.001127 ETH (about $3) |
| ATTACKER_FUNDER | `0xC33fa4B0c7202D0E92710711C4c4DB2387423DAA` | Deposits into MockMixer so a fresh wallet can withdraw demo gas | 0.006600 BNB (about $5) | 0.001879 ETH (about $5) |
| CRE_BROADCAST | `0x7187E19dF556cB94daFA26340B7483d8B70FCB48` | Gas for the CRE demo broadcast wallet. Deployer sends this; there is no key in this repo. | 0.008330 BNB | 0.003051 ETH |

The four role wallets above replaced the exposed set on 30 Sep 2026. Each new wallet received that role's existing balance minus gas. CRE_BROADCAST was not rotated. Do not send funds to the retired addresses.

Caps written into `.env` at these prices:

- Mixer denomination: 0.002640 BNB and 0.000751 ETH (about $2)
- Vault TVL cap: 0.032999 BNB and 0.009393 ETH (about $25)

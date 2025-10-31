/**
 * AsterDEX Deposit Contract Config
 *
 * Contains deposit contract addresses, ABIs, and utility helpers.
 * Used by AsterDepositService for building transactions.
 */

export const DEPOSIT_CONTRACTS = {
  ethereum: {
    address: "0x604dd02d620633ae427888d41bfd15e38483736e",
    chainId: 1,
    networkName: "Ethereum",
    explorerUrl: "https://etherscan.io/tx/",
  },
  arbitrum: {
    address: "0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5",
    chainId: 42161,
    networkName: "Arbitrum One",
    explorerUrl: "https://arbiscan.io/tx/",
  },
  bnb: {
    address: "0x128463a60784c4d3f46c23af3f65ed859ba87974",
    chainId: 56,
    networkName: "BNB Chain",
    explorerUrl: "https://bscscan.com/tx/",
  },
  solana: {
    address: "EhUtRgu9iEbZXXRpEvDj6n1wnQRjMi2SERDo3c6bmN2c",
    treasuryAccount: "5bXxj9Qa4hj15DHvzTgVy7z2VkEGNWFVQojfbUKAiGpE",
    networkName: "Solana",
    explorerUrl: "https://solscan.io/tx/",
  },
};

/**
 * Standard ERC20 ABI
 */
 export const ERC20_ABI = [
   {
     name: "allowance",
     type: "function",
     stateMutability: "view",
     inputs: [
       { name: "owner", type: "address" },
       { name: "spender", type: "address" },
     ],
     outputs: [{ name: "", type: "uint256" }],
   },
   {
     name: "approve",
     type: "function",
     stateMutability: "nonpayable",
     inputs: [
       { name: "spender", type: "address" },
       { name: "amount", type: "uint256" },
     ],
     outputs: [{ name: "", type: "bool" }],
   },
   {
     name: "balanceOf",
     type: "function",
     stateMutability: "view",
     inputs: [{ name: "account", type: "address" }],
     outputs: [{ name: "", type: "uint256" }],
   },
 ];


/**
 * AsterDEX Deposit Contract ABI (AstherusVault)
 */
export const DEPOSIT_CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "currency", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "broker", type: "uint256" },
    ],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "broker", type: "uint256" }],
    name: "depositNative",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "currency", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "broker", type: "uint256" },
    ],
    name: "depositV2",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "currency", type: "address" }],
    name: "balance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "fees",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "currency",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "broker",
        type: "uint256",
      },
    ],
    name: "Deposit",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "currency",
        type: "address",
      },
      { indexed: false, internalType: "bool", name: "isNative", type: "bool" },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "broker",
        type: "uint256",
      },
    ],
    name: "DepositV2",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "currency",
        type: "address",
      },
      { indexed: false, internalType: "bool", name: "isNative", type: "bool" },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "DepositFailed",
    type: "event",
  },
];

/**
 * Get contract info for a network
 */
export type SupportedNetwork = keyof typeof DEPOSIT_CONTRACTS;

export function getDepositContract(network: SupportedNetwork) {
  const contract = DEPOSIT_CONTRACTS[network];
  if (!contract)
    throw new Error(`Deposit contract not configured for network: ${network}`);
  return contract;
}

/**
 * Check if deposit is supported
 */
export function isDepositAvailable(network: string): boolean {
  try {
    const key = network.toLowerCase() as keyof typeof DEPOSIT_CONTRACTS;
    getDepositContract(key);
    return true;
  } catch {
    return false;
  }
}

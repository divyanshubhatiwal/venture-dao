import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * ethers is loaded on demand, not at module scope.
 *
 * It is ~95 KB gzipped and the only thing that needs it is the optional
 * "continue with wallet" button. Importing it statically meant every visitor —
 * including anyone who only ever reads the landing page — downloaded a web3
 * library to render text. Now the cost is paid by the people who click it.
 */
let ethersPromise = null
const loadEthers = () => {
  ethersPromise ??= import('ethers')
  return ethersPromise
}

const SEPOLIA_CHAIN_ID = '0xaa36a7'

const WalletContext = createContext(null)

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}

/** Demo identity used when MetaMask is not installed, so the flow stays clickable. */
const DEMO_ACCOUNT = {
  address: '0x8f2a4b17De93c1a05Ee7F3b62D40cA95bB71c410',
  balance: '3.4182',
  votingPower: 84_000,
  demo: true,
}

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  const hasMetaMask = typeof window !== 'undefined' && Boolean(window.ethereum)

  const readAccount = useCallback(async (address) => {
    const { BrowserProvider, formatEther } = await loadEthers()
    const provider = new BrowserProvider(window.ethereum)
    const [balance, network] = await Promise.all([provider.getBalance(address), provider.getNetwork()])
    setChainId('0x' + network.chainId.toString(16))
    setAccount({
      address,
      balance: (+formatEther(balance)).toFixed(4),
      // Token-weighted voting: read from the VDAO ERC-20 once deployed.
      votingPower: 84_000,
      demo: false,
    })
  }, [])

  const connect = useCallback(async () => {
    setError(null)
    if (!hasMetaMask) {
      setAccount(DEMO_ACCOUNT)
      setChainId(SEPOLIA_CHAIN_ID)
      return { demo: true, address: DEMO_ACCOUNT.address }
    }
    setConnecting(true)
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      await readAccount(accounts[0])
      // Returned rather than read from state: `account` will not be updated
      // until the next render, so a caller awaiting connect() cannot see it.
      return { demo: false, address: accounts[0] }
    } catch (err) {
      setError(err?.message || 'Wallet connection rejected')
      throw err
    } finally {
      setConnecting(false)
    }
  }, [hasMetaMask, readAccount])

  const disconnect = useCallback(() => {
    setAccount(null)
    setChainId(null)
  }, [])

  const switchToSepolia = useCallback(async () => {
    if (!hasMetaMask) return
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      })
    } catch (err) {
      if (err?.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID,
              chainName: 'Sepolia Test Network',
              nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            },
          ],
        })
      } else {
        setError(err?.message || 'Could not switch network')
      }
    }
  }, [hasMetaMask])

  // Keep UI in sync when the user swaps accounts or networks in MetaMask.
  useEffect(() => {
    if (!hasMetaMask) return undefined
    const onAccounts = (accounts) => (accounts.length ? readAccount(accounts[0]) : disconnect())
    const onChain = (id) => setChainId(id)
    window.ethereum.on('accountsChanged', onAccounts)
    window.ethereum.on('chainChanged', onChain)
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccounts)
      window.ethereum.removeListener?.('chainChanged', onChain)
    }
  }, [hasMetaMask, readAccount, disconnect])

  const value = useMemo(
    () => ({
      account,
      chainId,
      connecting,
      error,
      hasMetaMask,
      connected: Boolean(account),
      wrongNetwork: Boolean(account) && !account.demo && chainId !== SEPOLIA_CHAIN_ID,
      connect,
      disconnect,
      switchToSepolia,
    }),
    [account, chainId, connecting, error, hasMetaMask, connect, disconnect, switchToSepolia],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

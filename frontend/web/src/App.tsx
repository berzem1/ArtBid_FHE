import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface AuctionItem {
  id: string;
  name: string;
  description: string;
  creator: string;
  timestamp: number;
  encryptedBid: string;
  publicValue1: number;
  publicValue2: number;
  isVerified: boolean;
  decryptedValue: number;
  currentBid: number;
  endTime: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newAuctionData, setNewAuctionData] = useState({ name: "", description: "", startingBid: "" });
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null);
  const [biddingAmount, setBiddingAmount] = useState("");
  const [isBidding, setIsBidding] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const auctionsList: AuctionItem[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          auctionsList.push({
            id: businessId,
            name: businessData.name,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            encryptedBid: "",
            currentBid: Number(businessData.publicValue1) || 0,
            endTime: Number(businessData.timestamp) + 86400
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setAuctions(auctionsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createAuction = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingAuction(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating auction with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const bidValue = parseInt(newAuctionData.startingBid) || 0;
      const businessId = `auction-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, bidValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newAuctionData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        bidValue,
        0,
        newAuctionData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Auction created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewAuctionData({ name: "", description: "", startingBid: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingAuction(false); 
    }
  };

  const placeBid = async (auctionId: string, bidAmount: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setIsBidding(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Placing encrypted bid..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const encryptedResult = await encrypt(contractAddress, address, bidAmount);
      
      const tx = await contract.createBusinessData(
        `bid-${auctionId}-${Date.now()}`,
        `Bid for ${auctionId}`,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        bidAmount,
        0,
        `Bid placed by ${address}`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for bid confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid placed successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setBiddingAmount("");
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Bid failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsBidding(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) return null;
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      await loadData();
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        await loadData();
        return null;
      }
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredAuctions = auctions.filter(auction => {
    const matchesSearch = auction.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         auction.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterVerified || auction.isVerified;
    return matchesSearch && matchesFilter;
  });

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>ArtBid FHE 🎨</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to access the confidential art auction platform.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading auction platform...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>ArtBid FHE 🎨</h1>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            Check Status
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Auction
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="search-section">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search auctions..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filters">
            <label>
              <input 
                type="checkbox" 
                checked={filterVerified}
                onChange={(e) => setFilterVerified(e.target.checked)}
              />
              Show Verified Only
            </label>
          </div>
        </div>

        <div className="auctions-grid">
          {filteredAuctions.map((auction) => (
            <div key={auction.id} className="auction-card">
              <div className="artwork-preview"></div>
              <div className="auction-info">
                <h3>{auction.name}</h3>
                <p>{auction.description}</p>
                <div className="auction-meta">
                  <span>Current Bid: {auction.currentBid} ETH</span>
                  <span>{auction.isVerified ? '✅ Verified' : '🔒 Encrypted'}</span>
                </div>
                <div className="auction-actions">
                  <input 
                    type="number" 
                    placeholder="Bid amount" 
                    value={biddingAmount}
                    onChange={(e) => setBiddingAmount(e.target.value)}
                  />
                  <button 
                    onClick={() => placeBid(auction.id, parseFloat(biddingAmount))}
                    disabled={isBidding}
                  >
                    Place Bid
                  </button>
                  <button 
                    onClick={() => decryptData(auction.id)}
                    className="decrypt-btn"
                  >
                    Decrypt
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredAuctions.length === 0 && (
          <div className="no-auctions">
            <p>No auctions found</p>
            <button onClick={() => setShowCreateModal(true)} className="create-btn">
              Create First Auction
            </button>
          </div>
        )}
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Create New Auction</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <input 
                type="text" 
                placeholder="Artwork name" 
                value={newAuctionData.name}
                onChange={(e) => setNewAuctionData({...newAuctionData, name: e.target.value})}
              />
              <textarea 
                placeholder="Description" 
                value={newAuctionData.description}
                onChange={(e) => setNewAuctionData({...newAuctionData, description: e.target.value})}
              />
              <input 
                type="number" 
                placeholder="Starting bid (ETH)" 
                value={newAuctionData.startingBid}
                onChange={(e) => setNewAuctionData({...newAuctionData, startingBid: e.target.value})}
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button onClick={createAuction} disabled={creatingAuction}>
                {creatingAuction ? 'Creating...' : 'Create Auction'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
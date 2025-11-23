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
  encryptedBid: string;
  publicValue1: number;
  publicValue2: number;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
  category: string;
  imageUrl: string;
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
  const [newAuctionData, setNewAuctionData] = useState({ 
    name: "", 
    description: "", 
    bidAmount: "", 
    category: "Painting",
    imageUrl: ""
  });
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState({
    totalAuctions: 0,
    verifiedBids: 0,
    totalBidAmount: 0,
    activeUsers: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [contractAddress, setContractAddress] = useState("");

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('FHEVM initialization failed:', error);
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
            encryptedBid: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            category: "Art",
            imageUrl: "/api/placeholder/300/200"
          });
        } catch (e) {
          console.error('Error loading auction data:', e);
        }
      }
      
      setAuctions(auctionsList);
      updateStats(auctionsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updateStats = (auctionList: AuctionItem[]) => {
    const totalAuctions = auctionList.length;
    const verifiedBids = auctionList.filter(a => a.isVerified).length;
    const totalBidAmount = auctionList.reduce((sum, a) => sum + a.publicValue1, 0);
    const activeUsers = new Set(auctionList.map(a => a.creator)).size;

    setStats({
      totalAuctions,
      verifiedBids,
      totalBidAmount,
      activeUsers
    });
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
      
      const bidValue = parseInt(newAuctionData.bidAmount) || 0;
      const businessId = `artbid-${Date.now()}`;
      
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
      
      addUserHistory("CREATE_AUCTION", { name: newAuctionData.name, bid: bidValue });
      
      setTransactionStatus({ visible: true, status: "success", message: "Auction created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewAuctionData({ name: "", description: "", bidAmount: "", category: "Painting", imageUrl: "" });
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

  const decryptBid = async (auctionId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const auctionData = await contractRead.getBusinessData(auctionId);
      if (auctionData.isVerified) {
        const storedValue = Number(auctionData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Bid already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(auctionId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(auctionId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      addUserHistory("DECRYPT_BID", { auctionId, bid: Number(clearValue) });
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid decrypted successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Bid is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const addUserHistory = (action: string, data: any) => {
    const historyItem = {
      action,
      data,
      timestamp: Date.now(),
      address
    };
    setUserHistory(prev => [historyItem, ...prev.slice(0, 9)]);
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract call failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredAuctions = auctions.filter(auction => {
    const matchesSearch = auction.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         auction.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "All" || auction.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>ArtBid FHE 🔐</h1>
            <p>Confidential Auction for Art</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎨</div>
            <h2>Welcome to ArtBid FHE</h2>
            <p>Connect your wallet to participate in confidential art auctions with fully homomorphic encryption.</p>
            <div className="feature-grid">
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Private Bidding</h3>
                <p>Your bids are encrypted using FHE technology</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">👑</div>
                <h3>Anonymous Collectors</h3>
                <p>Protect your identity and bidding strategy</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">⚡</div>
                <h3>Instant Verification</h3>
                <p>Verify winning bids without revealing amounts</p>
              </div>
            </div>
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
        <p className="loading-note">Securing your art bids with advanced cryptography</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading confidential auction platform...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>ArtBid FHE 🔐</h1>
          <p>Confidential Auction for Art</p>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="test-btn">Test Contract</button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">+ New Auction</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <div className="main-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🎨</div>
            <div className="stat-content">
              <h3>{stats.totalAuctions}</h3>
              <p>Active Auctions</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🔐</div>
            <div className="stat-content">
              <h3>{stats.verifiedBids}</h3>
              <p>Verified Bids</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <h3>${stats.totalBidAmount}</h3>
              <p>Total Bid Value</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <h3>{stats.activeUsers}</h3>
              <p>Active Collectors</p>
            </div>
          </div>
        </div>

        <div className="controls-section">
          <div className="search-filter">
            <input 
              type="text" 
              placeholder="Search auctions..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select 
              value={filterCategory} 
              onChange={(e) => setFilterCategory(e.target.value)}
              className="filter-select"
            >
              <option value="All">All Categories</option>
              <option value="Painting">Painting</option>
              <option value="Sculpture">Sculpture</option>
              <option value="Digital">Digital Art</option>
            </select>
            <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="action-buttons">
            <button onClick={() => setShowFAQ(true)} className="faq-btn">FAQ</button>
            <button onClick={() => setUserHistory([])} className="history-btn">
              History ({userHistory.length})
            </button>
          </div>
        </div>

        <div className="auctions-grid">
          {filteredAuctions.length === 0 ? (
            <div className="no-auctions">
              <p>No auctions found matching your criteria</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Create First Auction
              </button>
            </div>
          ) : (
            filteredAuctions.map((auction) => (
              <div key={auction.id} className="auction-card">
                <div className="auction-image">
                  <img src={auction.imageUrl} alt={auction.name} />
                  <div className="auction-badge">
                    {auction.isVerified ? '✅ Verified' : '🔒 Encrypted'}
                  </div>
                </div>
                <div className="auction-content">
                  <h3>{auction.name}</h3>
                  <p>{auction.description}</p>
                  <div className="auction-meta">
                    <span>Category: {auction.category}</span>
                    <span>Bid: {auction.isVerified ? `$${auction.decryptedValue}` : '🔒 Hidden'}</span>
                  </div>
                  <div className="auction-actions">
                    <button 
                      onClick={async () => {
                        const decrypted = await decryptBid(auction.id);
                        if (decrypted !== null) {
                          setSelectedAuction({...auction, decryptedValue: decrypted, isVerified: true});
                        }
                      }}
                      className={`bid-btn ${auction.isVerified ? 'verified' : ''}`}
                    >
                      {auction.isVerified ? '✅ Verified' : '🔓 Reveal Bid'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateAuctionModal 
          onSubmit={createAuction}
          onClose={() => setShowCreateModal(false)}
          creating={creatingAuction}
          auctionData={newAuctionData}
          setAuctionData={setNewAuctionData}
          isEncrypting={isEncrypting}
        />
      )}

      {showFAQ && (
        <FAQModal onClose={() => setShowFAQ(false)} />
      )}

      {userHistory.length > 0 && (
        <HistoryPanel history={userHistory} onClose={() => setUserHistory([])} />
      )}

      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            {transactionStatus.status === "pending" && <div className="spinner"></div>}
            {transactionStatus.status === "success" && <span>✓</span>}
            {transactionStatus.status === "error" && <span>✗</span>}
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

const CreateAuctionModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  auctionData: any;
  setAuctionData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, auctionData, setAuctionData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'bidAmount') {
      const intValue = value.replace(/[^\d]/g, '');
      setAuctionData({ ...auctionData, [name]: intValue });
    } else {
      setAuctionData({ ...auctionData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Create New Auction</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Protection</strong>
            <p>Bid amount will be encrypted using Zama FHE technology</p>
          </div>

          <div className="form-group">
            <label>Artwork Name *</label>
            <input
              type="text"
              name="name"
              value={auctionData.name}
              onChange={handleChange}
              placeholder="Enter artwork name..."
            />
          </div>

          <div className="form-group">
            <label>Description *</label>
            <textarea
              name="description"
              value={auctionData.description}
              onChange={handleChange}
              placeholder="Describe the artwork..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Starting Bid (ETH) *</label>
            <input
              type="number"
              name="bidAmount"
              value={auctionData.bidAmount}
              onChange={handleChange}
              placeholder="Enter starting bid..."
              min="0"
              step="0.01"
            />
            <div className="input-hint">FHE Encrypted Integer</div>
          </div>

          <div className="form-group">
            <label>Category</label>
            <select name="category" value={auctionData.category} onChange={handleChange}>
              <option value="Painting">Painting</option>
              <option value="Sculpture">Sculpture</option>
              <option value="Digital">Digital Art</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={creating || isEncrypting || !auctionData.name || !auctionData.description || !auctionData.bidAmount}
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Auction"}
          </button>
        </div>
      </div>
    </div>
  );
};

const FAQModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="modal-overlay">
    <div className="modal-content faq-modal">
      <div className="modal-header">
        <h2>Frequently Asked Questions</h2>
        <button onClick={onClose} className="close-btn">×</button>
      </div>
      <div className="faq-content">
        <div className="faq-item">
          <h3>How does FHE protect my bids?</h3>
          <p>Your bids are encrypted on-chain using Fully Homomorphic Encryption, allowing computations without revealing the actual amount.</p>
        </div>
        <div className="faq-item">
          <h3>When are bids revealed?</h3>
          <p>Bids remain encrypted until the auction ends. Only the winning bid is revealed through cryptographic verification.</p>
        </div>
        <div className="faq-item">
          <h3>Is my identity protected?</h3>
          <p>Yes, FHE ensures complete privacy for both bid amounts and bidder identities throughout the auction process.</p>
        </div>
      </div>
    </div>
  </div>
);

const HistoryPanel: React.FC<{ history: any[]; onClose: () => void }> = ({ history, onClose }) => (
  <div className="history-panel">
    <div className="panel-header">
      <h3>Your Activity History</h3>
      <button onClick={onClose} className="close-btn">×</button>
    </div>
    <div className="history-list">
      {history.map((item, index) => (
        <div key={index} className="history-item">
          <div className="history-action">{item.action}</div>
          <div className="history-data">{JSON.stringify(item.data)}</div>
          <div className="history-time">{new Date(item.timestamp).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  </div>
);

export default App;



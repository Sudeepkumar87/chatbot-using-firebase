"use client"
import React, { useRef, useState, useEffect } from 'react'
import { useCollectionData } from "react-firebase-hooks/firestore"
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth, firestore, storage } from '@/components/redux/firebase'
import { collection, addDoc, query, orderBy, limit, Timestamp, startAfter, updateDoc, doc, where, getDocs } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useRouter, usePathname } from "next/navigation";
import Cookies from "js-cookie";


export default function ChatDetails() {
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [formValue, setFormValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [user, loading, error] = useAuthState(auth);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [paginatedMessages, setPaginatedMessages] = useState([]);
  const [attachment, setAttachment] = useState(null); // New state for attachment
  const [attachmentPreview, setAttachmentPreview] = useState(null); // New state for attachment preview
  const fileInputRef = useRef(null); // Ref for file input
  const dummy = useRef();
  const markedAsReadRef = useRef(new Set()); // Track which messages we've marked as read
      const router = useRouter();

  // Fetch all users from Firestore
  const usersQuery = query(collection(firestore, 'users'));
  const [users, loadingUsers, errorUsers] = useCollectionData(usersQuery, { idField: 'id' });
  
  // Fetch messages - increased limit to capture more messages
  const messagesRef = collection(firestore, 'messages');
  const q = user 
    ? query(messagesRef, orderBy('createdAt', 'desc'), limit(200))
    : query(messagesRef, orderBy('createdAt', 'desc'), limit(25));
  
  const [messages, loadingMessages, errorMessages] = useCollectionData(q, { idField: 'id' });
  
  // Get unique friends from conversation history
  const getFriendsFromConversations = () => {
    if (!messages || !users || !user) return [];
    
    const friendUids = new Set();
    
    // Extract unique UIDs from messages (both sender and recipient)
    messages.forEach(message => {
      if (message.uid === user.uid && message.recipientId) {
        friendUids.add(message.recipientId);
      } else if (message.recipientId === user.uid && message.uid) {
        friendUids.add(message.uid);
      }
    });
    
    // Map UIDs to user objects
    return users.filter(u => friendUids.has(u.uid) && u.uid !== user.uid);
  };
  
  // Get friends list based on search
  const getDisplayedFriends = () => {
    if (!users || !user) return [];
    
    // If there's a search term, search all users
    if (searchTerm && searchTerm.trim()) {
      return users.filter(u => {
        if (!u.name || typeof u.name !== 'string') return false;
        const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase());
        const isNotCurrentUser = u.uid !== user.uid;
        return matchesSearch && isNotCurrentUser;
      });
    }
    
    // If no search term, show only friends with conversation history
    return getFriendsFromConversations();
  };
  
  const displayedFriends = getDisplayedFriends();
  
  // Calculate unread message count for each friend
  const getUnreadCount = (friendUid) => {
    if (!messages || !user) return 0;
    
    return messages.filter(message => {
      // Message is unread if:
      // 1. It's from this friend to current user
      // 2. It hasn't been read (check all possible read indicators)
      const isFromFriend = message.uid === friendUid && message.recipientId === user.uid;
      
 
      const isUnread = message.read === false || 
                       message.read === undefined ||
                       !message.readAt || 
                       message.status !== 'read';
      
      return isFromFriend && isUnread;
    }).length;
  };
  
  useEffect(() => {
    if (!user || selectedFriend === null || !displayedFriends[selectedFriend] || !messages || messages.length === 0) return;
    
    const selectedFriendUid = displayedFriends[selectedFriend].uid;
    
    // Get ALL messages from this friend (including old ones without read fields)
    const messagesFromFriend = messages.filter(message => {
      const isFromSelectedFriend = message.uid === selectedFriendUid && message.recipientId === user.uid;
      return isFromSelectedFriend;
    });
    
    // Filter to only unread messages (avoid re-marking already read messages)
    const unreadMessages = messagesFromFriend.filter(message => {
      // Skip if we've already marked this message
      if (markedAsReadRef.current.has(message.id)) {
        return false;
      }
      
      // Consider unread if read is not true or status is not 'read'
      // This is more strict - we only skip if it's DEFINITELY been read
      return message.read !== true || message.status !== 'read';
    });
    
    // Mark all unread messages as read
    if (unreadMessages.length > 0) {
      const markAsRead = async () => {
        try {
          console.log(`Marking ${unreadMessages.length} messages as read from ${selectedFriendUid}`);
          const updatePromises = unreadMessages.map(async (message) => {
            try {
              // Mark in our ref first to avoid duplicate processing
              markedAsReadRef.current.add(message.id);
              
              const messageRef = doc(firestore, 'messages', message.id);
              await updateDoc(messageRef, {
                read: true,
                readAt: Timestamp.now(),
                status: 'read'
              });
              console.log(`Marked message ${message.id} as read`);
            } catch (err) {
              // Remove from ref if update failed
              markedAsReadRef.current.delete(message.id);
              console.error(`Error marking message ${message.id}:`, err);
            }
          });
          
          await Promise.all(updatePromises);
          console.log(`Successfully marked ${unreadMessages.length} messages as read`);
        } catch (error) {
          console.error('Error marking messages as read:', error);
        }
      };
      
      // Immediate execution - no delay needed
      markAsRead();
    }
  }, [selectedFriend, messages, user, displayedFriends]);
  
  // Filter messages for selected friend
  const filteredMessages = messages ? messages.filter(message => {
    if (!user) return false;
    
    if (selectedFriend === null || !displayedFriends[selectedFriend]) {
      return message.uid === user.uid || message.recipientId === user.uid;
    }
    
    const currentUserUid = user.uid;
    const selectedFriendUid = displayedFriends[selectedFriend].uid;
    
    return (
      (message.uid === currentUserUid && message.recipientId === selectedFriendUid) ||
      (message.uid === selectedFriendUid && message.recipientId === currentUserUid)
    );
  }).sort((a, b) => {
    const aTime = a.createdAt?.seconds || a.createdAt?.getTime() || 0;
    const bTime = b.createdAt?.seconds || b.createdAt?.getTime() || 0;
    return aTime - bTime;
  }) : [];
  
  // Implement pagination for messages
  const getPaginatedMessages = () => {
    // For simplicity, we'll show the last 20 messages and load more as needed
    // In a real implementation, this would be more sophisticated
    return filteredMessages.slice(-20);
  };
  
  const paginatedMsgs = getPaginatedMessages();
  
  // Reset selected friend when search changes
  useEffect(() => {
    setSelectedFriend(null);
    markedAsReadRef.current.clear(); // Clear marked messages when search changes
  }, [searchTerm]);
  
  // Clear marked messages ref when selected friend changes
  useEffect(() => {
    markedAsReadRef.current.clear();
  }, [selectedFriend]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (paginatedMsgs && paginatedMsgs.length > 0) {
      setTimeout(() => {
        dummy.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [paginatedMsgs]);
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      let date;
      
      if (timestamp.toDate) {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return '';
      }
      
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.error('Error formatting time:', error);
      return '';
    }
  };

  // Render read receipt icons (WhatsApp style)
  const renderReadReceipt = (message) => {
    // Only show for messages sent by current user
    if (message.uid !== user?.uid) return null;
    
    // Single checkmark (sent) - gray
    // Double checkmark (read) - blue
    // Check if message is read - check multiple fields for reliability
    const isRead = message.status === 'read' || message.read === true || message.readAt !== null && message.readAt !== undefined;
    const color = isRead ? 'text-blue-500' : 'text-gray-400';
    
    const CheckIcon = () => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    );
    
    return (
      <span className={`ml-1 inline-flex items-center ${color}`}>
        {isRead ? (
          // Double checkmark (read) - two checkmarks
          <span className="flex items-center -space-x-1">
            <CheckIcon />
            <CheckIcon />
          </span>
        ) : (
          // Single checkmark (sent)
          <CheckIcon />
        )}
      </span>
    );
  };
  
  // Add function to handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    console.log("File selected:", file);
    
    if (!file) {
      console.log("No file selected");
      return;
    }

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit. Please choose a smaller file.");
      return;
    }

    setAttachment(file);
    console.log("Attachment set:", file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachmentPreview(e.target.result);
        console.log("Preview set");
      };
      reader.readAsDataURL(file);
    }
  };

  // Add function to trigger file input
  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  // Add function to remove attachment
  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Modify sendMessages function to handle attachments
  const sendMessages = async (e) => {
    if (e) e.preventDefault();
    
    console.log("Send message called. Form value:", formValue, "Attachment:", attachment);
    
    if (!user) {
      alert("Please sign in to send messages");
      return;
    }

    if (!formValue.trim() && !attachment) {
      console.log("No content to send");
      return;
    }
    
    if (selectedFriend === null || !displayedFriends[selectedFriend]) {
      alert("Please select a friend to chat with");
      return;
    }
    
    // Check if storage is available
    if (!storage) {
      alert("Storage is not available. Please check your Firebase configuration.");
      return;
    }
    
    try {
      // Handle text message
      if (formValue.trim()) {
        console.log("Sending text message");
        await addDoc(messagesRef, {
          text: formValue,
          createdAt: Timestamp.now(),
          uid: user.uid,
          displayName: user.displayName || "Anonymous",
          recipientId: displayedFriends[selectedFriend].uid,
          recipientName: displayedFriends[selectedFriend].name,
          status: 'sent', // sent, delivered, read
          read: false,
          readAt: null
        });
      }
      
      // Handle attachment
      if (attachment) {
        console.log("Sending attachment:", attachment);
        try {
          // Upload file to Firebase Storage
          // Sanitize filename to remove special characters
          const sanitizedFileName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileRef = ref(storage, `attachments/${user.uid}/${Date.now()}_${sanitizedFileName}`);
          console.log("Uploading to:", fileRef.toString());
          
          // Upload with metadata
          const uploadResult = await uploadBytes(fileRef, attachment, {
            contentType: attachment.type
          });
          console.log("Upload result:", uploadResult);
          
          const fileUrl = await getDownloadURL(fileRef);
          console.log("Upload successful. URL:", fileUrl);
          
          // Save message with attachment URL
          await addDoc(messagesRef, {
            text: attachment.name,
            fileType: attachment.type,
            fileSize: attachment.size,
            fileUrl: fileUrl,
            isAttachment: true,
            createdAt: Timestamp.now(),
            uid: user.uid,
            displayName: user.displayName || "Anonymous",
            recipientId: displayedFriends[selectedFriend].uid,
            recipientName: displayedFriends[selectedFriend].name,
            status: 'sent', // sent, delivered, read
            read: false,
            readAt: null
          });
          
          // Reset attachment
          removeAttachment();
        } catch (uploadError) {
          console.error("Error uploading file:", uploadError);
          // Try to get more detailed error information
          let errorMessage = "Failed to upload file";
          if (uploadError.code) {
            errorMessage += ` (${uploadError.code})`;
          }
          if (uploadError.message) {
            errorMessage += `: ${uploadError.message}`;
          }
          alert(errorMessage);
          // Don't reset attachment on error so user can try again
          return;
        }
      }

      setFormValue('');
      console.log("Message sent successfully");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Error sending message: " + error.message);
    }
  };

  // Add logout function
  const handleLogout = async () => {
    try {
      await signOut(auth);
    Cookies.remove("auth");
    router.push("/");
    } catch (error) {
      console.error("Error signing out: ", error);
      alert("Error signing out. Please try again.");
    }
  };

  // Test function to check if storage is working
  const testStorage = async () => {
    try {
      // Create a simple test blob
      const testBlob = new Blob(["Hello, world!"], { type: "text/plain" });
      
      // Create a reference
      const fileRef = ref(storage, `test/test-${Date.now()}.txt`);
      console.log("Created reference:", fileRef.toString());
      
      // Try to upload
      const snapshot = await uploadBytes(fileRef, testBlob);
      console.log("Upload successful:", snapshot);
      
      // Try to get download URL
      const url = await getDownloadURL(fileRef);
      console.log("Download URL:", url);
      
      alert("Storage test successful! You can send images now.");
    } catch (error) {
      console.error("Storage test failed:", error);
      let errorMessage = "Storage test failed";
      if (error.code) {
        errorMessage += ` (${error.code})`;
      }
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      alert(errorMessage);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (error) {
    console.error("Authentication error:", error);
    return <div className="flex h-screen items-center justify-center">Error: {error.message}</div>;
  }
  
  if (loadingMessages) {
    return <div className="flex h-screen items-center justify-center">Loading messages...</div>;
  }
  
  if (errorMessages) {
    if (errorMessages.message && errorMessages.message.includes('index')) {
      console.warn("Firestore index warning (not critical):", errorMessages.message);
    } else {
      console.error("Messages error:", errorMessages);
      return <div className="flex h-screen items-center justify-center">Error loading messages: {errorMessages.message}</div>;
    }
  }
  
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl mb-4">Please sign in to access chats</h2>
          <button 
            onClick={() => window.location.href = '/login'}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Friends list sidebar */}
      <div className="w-1/3 bg-white dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700 flex flex-col">
          {/* Friends list header */}
          <div className="bg-green-600 text-white p-4">
            <div className="flex justify-between items-center">
              <h1 className="text-xl font-semibold">{user?.displayName || user?.email || 'User'}</h1>
            <div className="flex space-x-4">
              <button 
                onClick={testStorage}
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full focus:outline-none transition duration-200 shadow-md"
                title="Test Storage"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </button>
              <button 
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full focus:outline-none transition duration-200 shadow-md"
                title="Logout"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
            </div>
          </div>
          
          {/* Search bar */}
          <div className="p-2 bg-gray-100 dark:bg-gray-700">
            <div className="relative">
              <input
                type="text"
                placeholder="Search or start new chat..."
                className="w-full rounded-full py-2 px-4 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute right-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Friends list */}
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex items-center justify-center h-20">
                <div className="text-gray-500 dark:text-gray-400">Loading...</div>
              </div>
            ) : errorUsers ? (
              <div className="flex items-center justify-center h-20">
                <div className="text-red-500">Error loading users</div>
              </div>
            ) : displayedFriends.length === 0 ? (
              <div className="flex items-center justify-center h-20 px-4 text-center">
                <div className="text-gray-500 dark:text-gray-400">
                  {searchTerm 
                    ? "No users found matching your search" 
                    : "No conversations yet. Search for a user to start chatting!"}
                </div>
              </div>
            ) : (
              displayedFriends.map((friend, index) => (
                <div 
                  key={`${friend.uid}-${index}`} 
                  className={`flex items-center p-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    selectedFriend === index ? 'bg-green-50 dark:bg-green-900' : ''
                  }`}
                  onClick={() => {
                    setSelectedFriend(index);
                  }}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white font-semibold">
                      {friend.name ? friend.name.charAt(0) : '?'}
                    </div>
            
                  </div>
                  <div className="ml-4 flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <h2 className="font-semibold text-gray-900 dark:text-white truncate">{friend.name || 'Unknown User'}</h2>
                    <div className="flex items-center space-x-2">
                      {getUnreadCount(friend.uid) > 0 && (
                        <span className="bg-green-600 text-white text-xs font-semibold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                          {getUnreadCount(friend.uid) > 99 ? '99+' : getUnreadCount(friend.uid)}
                        </span>
                      )}
                    </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {searchTerm ? "Start new conversation" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="bg-green-600 text-white p-4 flex items-center">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-semibold">
              {(displayedFriends[selectedFriend]?.name || 'S').charAt(0)}
            </div>
          </div>
          <div className="ml-4">
            <h2 className="font-semibold">{displayedFriends[selectedFriend]?.name || 'Welcome to Chat'}</h2>
            {/* <p className="text-xs text-green-200">
              {displayedFriends[selectedFriend] ? 'online' : 'Select a friend to start chatting'}
            </p> */}
          </div>
          {/* Pagination indicator */}
          <div className="ml-auto">
            {isLoadingMore && (
              <div className="text-xs text-green-200">Loading more messages...</div>
            )}
          </div>
        </div>
        
        {/* Chat messages area */}
        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {/* Show loading indicator at the top when loading more */}
          {isLoadingMore && (
            <div className="text-center py-2 text-gray-500">Loading more messages...</div>
          )}
          
          {selectedFriend !== null ? (
            <div className="space-y-2">
              {paginatedMsgs && paginatedMsgs.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.uid === user?.uid ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.uid === user?.uid
                        ? 'bg-green-100 dark:bg-green-700 text-gray-800 dark:text-white rounded-br-none'
                        : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white rounded-bl-none'
                    }`}
                  >
                    {message.isAttachment ? (
                      message.fileType && message.fileType.startsWith('image/') ? (
                        <div>
                            <img 
                              src={message.fileUrl} 
                            alt={message.text} 
                            className="max-w-full h-auto rounded-lg max-h-60"
                            />
                          <p className="text-xs mt-1 text-gray-500 dark:text-gray-300">{message.text}</p>
                          </div>
                      ) : (
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <a 
                                href={message.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                              >
                            {message.text}
                              </a>
                            </div>
                      )
                    ) : (
                      <p>{message.text}</p>
                    )}
                    <div className={`flex items-center justify-end mt-1 ${message.uid === user?.uid ? 'text-gray-500 dark:text-gray-300' : 'text-gray-400 dark:text-gray-300'}`}>
                      <span className="text-xs">{formatTime(message.createdAt)}</span>
                      {renderReadReceipt(message)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="mt-4 text-xl font-medium">Welcome to Chat</p>
                <p className="mt-2">Select a friend from the list to start chatting</p>
              </div>
            </div>
          )}
          <div ref={dummy}></div>
        </div>
        
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="*/*"
        />
        
          {/* Attachment preview */}
        {attachment && (
          <div className="bg-gray-200 dark:bg-gray-700 p-4 pt-0">
            <div className="flex items-center mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-300 mr-2">{attachment.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">({Math.round(attachment.size / 1024)} KB)</span>
            </div>
          {attachmentPreview && (
              <div className="relative inline-block">
                <img 
                  src={attachmentPreview} 
                  alt="Preview" 
                  className="max-h-32 max-w-xs rounded-lg object-cover"
                />
                <button
                  onClick={removeAttachment}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            )}
            </div>
          )}
          
        {/* Message input area - only show when a friend is selected */}
        {selectedFriend !== null && (
        <div className="bg-gray-200 dark:bg-gray-800 p-4 sticky bottom-0">
          <div className="flex items-center">
            <div className="flex items-center">
              <button 
                type="button" 
                onClick={triggerFileInput}
                className="text-gray-500 dark:text-gray-400 p-2 rounded-full hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
              <button
                type="button" 
                onClick={testStorage}
                className="text-gray-500 dark:text-gray-400 p-2 rounded-full hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none ml-1"
                title="Test Storage"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </button>
            </div>
            <div className="flex-1 bg-white dark:bg-gray-700 rounded-full px-4 py-2 mx-2">
              <input
                type="text"
                placeholder="Type a message"
                className="w-full outline-none text-gray-900 dark:text-white"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    sendMessages(e);
                  }
                }}
              />
            </div>
            <button 
              onClick={sendMessages}
              className="bg-green-600 text-white rounded-full w-12 h-12 flex items-center justify-center focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!formValue.trim() && !attachment}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
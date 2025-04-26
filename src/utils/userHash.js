function getUserHash() {
    let hash = localStorage.getItem('user_hash');
    if (!hash) {
      hash = Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
      localStorage.setItem('user_hash', hash);
    }
    return hash;
  }

  export default getUserHash; 
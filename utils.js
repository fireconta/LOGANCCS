const utils = {
  formatBin(cardNumber) {
    if (!cardNumber) return '';
    return cardNumber.slice(0, 6);
  },

  formatExpiry(month, year) {
    if (!month || !year) return '';
    return `${month.padStart(2, '0')}/${year}`;
  },

  validateCardNumber(cardNumber) {
    if (!cardNumber || cardNumber.length < 13 || cardNumber.length > 19) return false;
    return /^\d+$/.test(cardNumber);
  },

  validateCvv(cvv) {
    if (!cvv) return false;
    return /^\d{3,4}$/.test(cvv);
  },

  validateExpiry(month, year) {
    if (!month || !year) return false;
    const currentYear = new Date().getFullYear();
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    if (isNaN(monthNum) || isNaN(yearNum)) return false;
    if (monthNum < 1 || monthNum > 12) return false;
    if (yearNum < currentYear || yearNum > currentYear + 10) return false;
    const currentDate = new Date();
    const expiryDate = new Date(yearNum, monthNum - 1);
    return expiryDate >= currentDate;
  },

  isValidUrl(url) {
    try {
      new URL(url);
      return /^https?:\/\//.test(url);
    } catch {
      return false;
    }
  },

  generateUserId(mongoId) {
    if (!mongoId) return '';
    return (parseInt(mongoId, 16) % 1000000000).toString().padStart(9, '0');
  }
};

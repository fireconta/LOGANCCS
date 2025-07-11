const Utils = {
  formatBin(cardNumber) {
    return cardNumber ? cardNumber.slice(0, 6) + '**** **** ' + cardNumber.slice(-4) : '';
  },
  formatExpiry(month, year) {
    return month && year ? `${month.toString().padStart(2, '0')}/${year}` : '';
  },
  validateCardNumber(cardNumber) {
    return cardNumber && cardNumber.length >= 16;
  },
  validateCvv(cvv) {
    return cvv && cvv.length >= 3 && cvv.length <= 4 && /^\d+$/.test(cvv);
  },
  validateExpiry(month, year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return month >= 1 && month <= 12 && year >= currentYear && (year > currentYear || month >= currentMonth);
  },
  validateUsername(username) {
    return username && username.length >= 3 && /^[a-zA-Z0-9]+$/.test(username);
  },
  validatePassword(password) {
    return password && password.length >= 6;
  }
};

window.utils = Utils;

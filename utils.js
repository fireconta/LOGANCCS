const Utils = {
  formatBin(cardNumber) {
    if (!cardNumber) return '';
    return cardNumber.slice(0, 6) + '**** **** ' + cardNumber.slice(-4);
  },
  formatExpiry(month, year) {
    if (!month || !year) return '';
    return `${month.toString().padStart(2, '0')}/${year}`;
  },
  validateCardNumber(cardNumber) {
    if (!cardNumber || cardNumber.length !== 16 || !/^\d+$/.test(cardNumber)) return false;
    // Algoritmo Luhn
    let sum = 0;
    let isEven = false;
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  },
  validateCvv(cvv, brand) {
    if (!cvv || !/^\d+$/.test(cvv)) return false;
    return brand === 'American Express' ? cvv.length === 4 : cvv.length === 3;
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
    return password && password.length >= 6 && /[A-Z]/.test(password) && /[0-9]/.test(password);
  },
  sanitizeInput(input) {
    return input.replace(/[<>&"']/g, '');
  }
};

window.utils = Utils;

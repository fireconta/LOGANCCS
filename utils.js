const utils = {
  validateUsername(username) {
    return /^[a-zA-Z0-9]{3,20}$/.test(username);
  },

  validatePassword(password) {
    const minLength = password.length >= 8;
    const uppercase = /[A-Z]/.test(password);
    const lowercase = /[a-z]/.test(password);
    const number = /[0-9]/.test(password);
    const special = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const valid = minLength && uppercase && lowercase && number && special;
    let message = '';
    let strengthClass = 'strength-weak';
    
    if (valid) {
      message = 'Senha forte';
      strengthClass = 'strength-strong';
    } else if (minLength && (uppercase || lowercase) && number) {
      message = 'Senha média. Adicione uma letra maiúscula e um caractere especial.';
      strengthClass = 'strength-medium';
    } else {
      message = 'Senha fraca. Use pelo menos 8 caracteres, incluindo letras maiúsculas, minúsculas, números e caracteres especiais.';
    }

    return {
      valid,
      message,
      class: strengthClass,
      length: minLength,
      uppercase,
      lowercase,
      number,
      special
    };
  },

  validateCardNumber(cardNumber) {
    cardNumber = cardNumber.replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(cardNumber)) return false;
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

  validateCvv(cvv) {
    return /^\d{3,4}$/.test(cvv);
  },

  validateExpiry(month, year) {
    if (!/^\d{2}$/.test(month) || !/^\d{4}$/.test(year)) return false;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const m = parseInt(month);
    const y = parseInt(year);
    if (m < 1 || m > 12) return false;
    if (y < currentYear || (y === currentYear && m < currentMonth)) return false;
    return true;
  },

  isValidUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  },

  formatBin(cardNumber) {
    if (!cardNumber) return '';
    cardNumber = cardNumber.replace(/\s/g, '');
    if (cardNumber.length < 6) return cardNumber;
    return cardNumber.slice(0, 6) + ' **** **** ' + cardNumber.slice(-4);
  },

  formatExpiry(month, year) {
    if (!month || !year) return '';
    return `${month.padStart(2, '0')}/${year}`;
  },

  generateUserId(id) {
    if (!id) return '';
    return id.slice(-6).toUpperCase();
  }
};

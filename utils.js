function restrictInput(element, type, maxLength) {
  if (type === 'numeric') {
    element.value = element.value.replace(/[^0-9]/g, '');
  }
  if (maxLength && element.value.length > maxLength) {
    element.value = element.value.slice(0, maxLength);
  }
}

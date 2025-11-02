function requiredField(label: string) {
  return (value: string) => {
    if (!value?.trim()) {
      return `${label} is required.`;
    }
    return true;
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
}

export { capitalize, formatTimestamp, requiredField };


import React from 'react';

interface QuantityInputProps {
  value: number | string;
  onChange: (newValue: string) => void;
  presets?: { val: string; display: string }[];
  placeholder?: string;
  id?: string;
  inputClassName?: string;
  readOnly?: boolean;
}

const defaultPresets = [
  { val: '0', display: '0' },
  { val: '0.5', display: '½' },
  { val: '1', display: '1' },
];

const QuantityInput: React.FC<QuantityInputProps> = ({ value, onChange, presets = defaultPresets, placeholder, id, inputClassName = 'w-16', readOnly = false }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const newValue = e.target.value;
    // Allow empty string, numbers, and a single decimal point
    if (newValue === '' || /^[0-9]*\.?[0-9]*$/.test(newValue)) {
      onChange(newValue);
    }
  };

  const PresetButton: React.FC<{ val: string; display: string; isLast: boolean }> = ({ val, display, isLast }) => (
    <button
      type="button"
      onClick={() => !readOnly && onChange(val)}
      disabled={readOnly}
      className={`px-3 h-8 text-sm font-semibold border border-gray-300 ${isLast ? 'rounded-r-md' : ''} ${
        // Highlight if the value matches, treating empty string as '0' for the button highlight
        (value === '' && val === '0') || String(value) === val
          ? 'bg-blue-600 text-white border-blue-600 z-10'
          : 'bg-gray-50 hover:bg-gray-100'
      } focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed`}
      aria-label={`Set quantity to ${val}`}
    >
      {display}
    </button>
  );

  return (
    <div className="inline-flex items-center -space-x-px">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`${inputClassName} border border-gray-300 h-8 text-center py-1 rounded-l-md focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm disabled:bg-gray-100 relative z-10`}
      />
      <div className="flex">
        {presets.map((p, index) => (
          <PresetButton key={p.val} val={p.val} display={p.display} isLast={index === presets.length - 1} />
        ))}
      </div>
    </div>
  );
};

export default QuantityInput;
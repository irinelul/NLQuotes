import React, { useState, useRef, useEffect } from 'react';

const SearchableDropdown = ({ options = [], value, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Ensure options is always an array
    const safeOptions = Array.isArray(options) ? options : [];
    
    const filteredOptions = safeOptions.filter(option =>
        option && typeof option === 'string' && option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const arrowStyle = {
        position: 'absolute',
        right: '10px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--text-secondary)',
        fontSize: '12px',
        pointerEvents: 'none'
    };

    return (
        <div className="searchable-dropdown" ref={dropdownRef}>
            <div 
                className="dropdown-header" 
                onClick={() => setIsOpen(!isOpen)}
            >
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    placeholder={value === "all" ? placeholder : value}
                    className="dropdown-input"
                />
                <span className="dropdown-arrow" style={arrowStyle}>▼</span>
            </div>
            {isOpen && (
                <div className="dropdown-options">
                    <div
                        className="dropdown-option"
                        onClick={() => {
                            onChange({ target: { value: "all" } });
                            setSearchTerm('');
                            setIsOpen(false);
                        }}
                    >
                        {placeholder}
                    </div>
                    {filteredOptions.map((option, index) => (
                        <div
                            key={index}
                            className="dropdown-option"
                            onClick={() => {
                                onChange({ target: { value: option } });
                                setSearchTerm('');
                                setIsOpen(false);
                            }}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown; 
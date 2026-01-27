import styles from './ChannelRadioButton.module.css';

export const ChannelRadioButton = ({ selectedChannel, handleChannelChange, id, name }) => {
    const isSelected = selectedChannel === id;
    
    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only trigger change if not already selected
        if (!isSelected) {
            handleChannelChange(id);
        }
    };
    
    return (
        <div
            className={styles.radioButton}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick(e);
                }
            }}
        >
            <input
                type="radio"
                id={id}
                value={id}
                checked={isSelected}
                readOnly
                tabIndex={-1}
            />
            <label htmlFor={id} className={styles.radioLabel} onClick={handleClick}>
                {name}
            </label>
        </div>
    )
}

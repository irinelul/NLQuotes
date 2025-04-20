import styles from './ChannelRadioButton.module.css';

export const ChannelRadioButton = ({ selectedChannel, handleChannelChange, id, name }) => {
    const isSelected = selectedChannel === id;
    return (
        <div
            className={styles.radioButton}
            onClick={() => handleChannelChange(id)}
        >
            <input
                type="radio"
                id={id}
                value={id}
                checked={isSelected}
                onChange={handleChannelChange}
            />
            <label htmlFor={id} className={styles.radioLabel}>
                {name}
            </label>
        </div>
    )
}

import pickle

def extract_game_titles():
    try:
        # Read the pickle file
        with open('game_analysis_progress.pkl', 'rb') as f:
            data = pickle.load(f)
        
        # Extract game titles from the dictionary
        game_titles = list(data['title_examples'].keys())
        
        # Sort the titles alphabetically
        game_titles.sort()
        
        # Write titles to a text file
        with open('game_titles.txt', 'w', encoding='utf-8') as f:
            for title in game_titles:
                f.write(f"{title}\n")
        
        print(f"Successfully extracted {len(game_titles)} game titles to game_titles.txt")
        
    except FileNotFoundError:
        print("Error: game_analysis_progress.pkl file not found in the current directory")
    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    extract_game_titles() 
import os
import json

def read_xml(img_file):
    """Read the JSON annotation file and extract bounding boxes.

    Args:
        img_file (str): The image file path.

    Returns:
        list: A list of dictionaries containing bounding box details.
    """
    file_name = img_file.split("/")[-1].split(".png")[0]
    json_file = f"/home/tih06/Desktop/BGenV/Data_viewer_V1/comments/master_comments.json"

    if not os.path.isfile(json_file):
        return []

    with open(json_file, "r", encoding="utf-8") as file:
        data = json.load(file)
    if file_name in data:
        existing_data = data[file_name]
    else:
        return []
    
    required_format = []
    for user in existing_data:
        for rect in existing_data[user]:
            required_format.append(rect)
    
    return required_format

def output_xml(img_file, img, rects):
    """Save the annotations in a JSON file, updating annotations and their replies.

    Args:
        img_file (str): The image file path.
        img (PIL.Image): The image object.
        rects (list): List of bounding boxes with user, time, and replies.
    """
    file_name = img_file.split("/")[-1].split(".png")[0]
    json_path = "/home/tih06/Desktop/BGenV/Data_viewer_V1/comments/master_comments.json"

    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(json_path), exist_ok=True)

    # Load existing data if the file exists
    if os.path.isfile(json_path):
        with open(json_path, "r", encoding="utf-8") as file:
            existing_data = json.load(file)
    else:
        existing_data = {}

    # Ensure file_name exists in the structure
    if file_name not in existing_data:
        existing_data[file_name] = {}

    change = False
    data_to_be_added = []
    data_to_be_removed = []

    for rect in rects:
        user = rect["user"]
        if user not in existing_data[file_name]:
            existing_data[file_name][user] = []

        # Convert list of dicts to sets of tuples (excluding replies for comparison)
        existing_rects = {tuple(sorted({k: v for k, v in d.items() if k != "reply"}.items())) 
                          for d in existing_data[file_name][user]}
        
        rect_tuple = tuple(sorted({k: v for k, v in rect.items() if k != "reply"}.items()))

        # Check if annotation already exists
        if rect_tuple not in existing_rects:
            data_to_be_added.append(rect)
            change = True
        else:
            # If annotation exists, update its replies
            for existing_rect in existing_data[file_name][user]:
                if {k: v for k, v in existing_rect.items() if k != "reply"} == \
                   {k: v for k, v in rect.items() if k != "reply"}:
                    
                    # Compare replies and update if different
                    if existing_rect["reply"] != rect["reply"]:
                        existing_rect["reply"] = rect["reply"]
                        change = True  # Mark change detected

    # Check for removed annotations
    for user, user_rects in existing_data[file_name].items():
        existing_rects = {tuple(sorted({k: v for k, v in d.items() if k != "reply"}.items())) 
                          for d in user_rects}
        new_rects = {tuple(sorted({k: v for k, v in r.items() if k != "reply"}.items())) 
                     for r in rects if r["user"] == user}

        removed_rects = existing_rects - new_rects  # Anything in existing but not in new is deleted
        if removed_rects:
            data_to_be_removed.extend(removed_rects)
            change = True

            # Remove deleted annotations from the existing data
            existing_data[file_name][user] = [
                d for d in user_rects if tuple(sorted({k: v for k, v in d.items() if k != "reply"}.items())) not in removed_rects
            ]

    if not change:
        print("No changes detected.")
        return

    # Add new annotations (including replies)
    if data_to_be_added:
        existing_data[file_name][rects[0]["user"]].extend(data_to_be_added)

    # Save updated JSON
    with open(json_path, "w", encoding="utf-8") as json_file:
        json.dump(existing_data, json_file, indent=4)

    print(f"Annotations updated in {json_path}")


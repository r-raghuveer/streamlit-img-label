import os
import json

def read_xml(img_file, project, master_task, task, datasets, models):
    """Read the JSON annotation file and extract bounding boxes.

    Args:
        img_file (str): The image file path.

    Returns:
        list: A list of dictionaries containing bounding box details.
    """
    file_name = img_file.split("/")[-1].split(".png")[0]
    json_file = f"/projects/data/vision-team/raghuveer/dataviewer/GR_VQA-Data_viewer/JSONS/{project}_dataset_shuffled.json"

    if not os.path.isfile(json_file):
        return []

    with open(json_file, "r", encoding="utf-8") as file:
        data = json.load(file)
    
    try:
        existing_data = data.get(master_task, {}).get(task, {}).get(datasets, {}).get(models, {}).get(file_name, {})
    except (KeyError, AttributeError):
        return []
    
    required_format = []
    for user in existing_data:
        for rect in existing_data.get(user, []):
            required_format.append(rect)
    
    return required_format

def output_xml(img_file, rects, project, master_task, task, datasets, models):
    """Save the annotations in a JSON file, updating annotations and their replies.

    Args:
        img_file (str): The image file path.
        img (PIL.Image): The image object.
        rects (list): List of bounding boxes with user, time, and replies.
    """
    file_name = img_file.split("/")[-1].split(".png")[0]
    json_path = f"/projects/data/vision-team/raghuveer/dataviewer/GR_VQA-Data_viewer/JSONS/{project}_dataset_shuffled.json"

    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(json_path), exist_ok=True)

    # Load existing data if the file exists
    if os.path.isfile(json_path):
        with open(json_path, "r", encoding="utf-8") as file:
            try:
                existing_data1 = json.load(file)
            except json.JSONDecodeError:
                existing_data1 = {}
    else:
        existing_data1 = {}

    # Initialize nested dictionary structure if keys don't exist
    if master_task not in existing_data1:
        existing_data1[master_task] = {}
    if task not in existing_data1[master_task]:
        existing_data1[master_task][task] = {}
    if datasets not in existing_data1[master_task][task]:
        existing_data1[master_task][task][datasets] = {}
    if models not in existing_data1[master_task][task][datasets]:
        existing_data1[master_task][task][datasets][models] = {}
    if file_name not in existing_data1[master_task][task][datasets][models]:
        existing_data1[master_task][task][datasets][models][file_name] = {}

    existing_data = existing_data1[master_task][task][datasets][models][file_name]

    change = False
    data_to_be_added = []
    data_to_be_removed = []

    for rect in rects:
        user = rect['label'].get("user", "Unknown")
        if user not in existing_data:
            existing_data[user] = []

        # Convert list of dicts to sets of tuples (excluding replies for comparison)
        existing_rects = {tuple(sorted({k: v for k, v in d['label'].items() if k != "replies"}.items())) 
                          for d in existing_data.get(user, [])}
        
        rect_tuple = tuple(sorted({k: v for k, v in rect['label'].items() if k != "replies"}.items()))

        # Check if annotation already exists
        if rect_tuple not in existing_rects:
            data_to_be_added.append(rect)
            change = True
        else:
            # If annotation exists, update its replies
            for existing_rect in existing_data.get(user, []):
                if {k: v for k, v in existing_rect['label'].items() if k != "replies"} == \
                   {k: v for k, v in rect['label'].items() if k != "replies"}:
                    
                    # Compare replies and update if different
                    if existing_rect["label"].get("replies") != rect["label"].get("replies"):
                        existing_rect["label"]["replies"] = rect["label"].get("replies", [])
                        change = True

    # Check for removed annotations
    for user, user_rects in existing_data.items():
        existing_rects = {tuple(sorted({k: v for k, v in d['label'].items() if k != "replies"}.items())) 
                          for d in user_rects}
        new_rects = {tuple(sorted({k: v for k, v in r['label'].items() if k != "replies"}.items())) 
                     for r in rects if r['label'].get("user") == user}

        removed_rects = existing_rects - new_rects  # Anything in existing but not in new is deleted
        if removed_rects:
            data_to_be_removed.extend(removed_rects)
            change = True

            # Remove deleted annotations from the existing data
            existing_data[user] = [
                d for d in user_rects if tuple(sorted({k: v for k, v in d['label'].items() if k != "replies"}.items())) not in removed_rects
            ]

    if not change:
        print("No changes detected.")
        return

    if data_to_be_added:
        for rect in data_to_be_added:
            user = rect['label'].get("user", "Unknown")
            if user not in existing_data:
                existing_data[user] = []
            existing_data[user].append(rect)

    existing_data1[master_task][task][datasets][models][file_name] = existing_data
    # Save updated JSON
    with open(json_path, "w", encoding="utf-8") as json_file:
        json.dump(existing_data1, json_file, indent=4)

    print(f"Annotations updated in {json_path}")

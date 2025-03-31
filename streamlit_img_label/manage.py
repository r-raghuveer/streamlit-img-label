import os
import re
import numpy as np
from PIL import Image
from .annotation import output_xml, read_xml
from datetime import datetime
import threading
from collections import deque

class ImageManager:
    """ImageManager
    Manage the image object.

    Args:
        filename(str): the image file.
    """

    def __init__(self, filename, project, master_task, task, datasets, models):
        """initiate module"""
        self._filename = filename
        self._img = Image.open(filename)
        self._rects = []
        self._load_rects(project, master_task, task, datasets, models)
        self._resized_ratio_w = 1
        self._resized_ratio_h = 1

    def _load_rects(self, project, master_task, task, datasets, models):
        self._rects = read_xml(self._filename, project, master_task, task, datasets, models)

    def get_img(self):
        """get the image object

        Returns:
            img(PIL.Image): the image object.
        """
        return self._img

    def get_rects(self):
        """get the rects

        Returns:
            rects(list): the bounding boxes of the image.
        """
        return self._rects

    def resizing_img(self, max_height=700, max_width=700):
        """resizing the image by max_height and max_width.

        Args:
            max_height(int): the max_height of the frame.
            max_width(int): the max_width of the frame.
        Returns:
            resized_img(PIL.Image): the resized image.
        """
        resized_img = self._img.copy()
        if resized_img.height > max_height:
            ratio = max_height / resized_img.height
            resized_img = resized_img.resize(
                (int(resized_img.width * ratio), int(resized_img.height * ratio))
            )
        if resized_img.width > max_width:
            ratio = max_width / resized_img.width
            resized_img = resized_img.resize(
                (int(resized_img.width * ratio), int(resized_img.height * ratio))
            )

        self._resized_ratio_w = self._img.width / resized_img.width
        self._resized_ratio_h = self._img.height / resized_img.height
        return resized_img

    def _resize_rect(self, rect):
        resized_rect = rect
        resized_rect["left"] = rect["left"] / self._resized_ratio_w
        resized_rect["width"] = rect["width"] / self._resized_ratio_w
        resized_rect["top"] = rect["top"] / self._resized_ratio_h
        resized_rect["height"] = rect["height"] / self._resized_ratio_h
        return resized_rect

    def get_resized_rects(self):
        """get resized the rects according to the resized image.

        Returns:
            resized_rects(list): the resized bounding boxes of the image.
        """
        return [self._resize_rect(rect) for rect in self._rects]

    def _chop_box_img(self, rect):
        rect["left"] = int(rect["left"] * self._resized_ratio_w)
        rect["width"] = int(rect["width"] * self._resized_ratio_w)
        rect["top"] = int(rect["top"] * self._resized_ratio_h)
        rect["height"] = int(rect["height"] * self._resized_ratio_h)
        left, top, width, height = (
            rect["left"],
            rect["top"],
            rect["width"],
            rect["height"],
        )

        raw_image = np.asarray(self._img).astype("uint8")
        prev_img = np.zeros(raw_image.shape, dtype="uint8")
        prev_img[top : top + height, left : left + width] = raw_image[
            top : top + height, left : left + width
        ]
        prev_img = prev_img[top : top + height, left : left + width]
        if rect['label']['time']:
            time = rect['label']['time']
        else:
            time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if rect['label']['user']!= 'You':
            user = rect['label']['user']
        else:
            user = "You"
        comments =  rect['label']['comment']

        return [Image.fromarray(prev_img), comments, user, time]

    def init_annotation(self, rects):
        """init annotation for current rects.

        Args:
            rects(list): the bounding boxes of the image.
        Returns:
            prev_img(list): list of preview images with default label.
        """
        self._current_rects = rects
        return [self._chop_box_img(rect) for rect in self._current_rects]

    def set_annotation(self, index, label, user, time):
        """Sets an annotation and queues a write operation."""
        print("entering set_comment",label)
        if self._current_rects[index]["label"]["comment"] != label:
            self._current_rects[index]["label"]["comment"] = label
            self._current_rects[index]["label"]["user"] = user
            self._current_rects[index]["label"]["time"] = time
        print("exiting set_comment",label)

    def save_annotation(self, project, master_task, task, datasets, models):
        output_xml(self._filename, self._current_rects, project, master_task, task, datasets, models)

    def set_reply(self, index, user, reply, j):
        """Adds a reply and queues a write operation."""
        if j < len(self._current_rects[index]["label"]["reply"]):
            self._current_rects[index]["label"]["reply"][j] = reply
        else:
            self._current_rects[index]["label"]["reply"].append({"user": user, "reply": reply})

class ImageDirManager:
    def __init__(self, dir_name):
        self._dir_name = dir_name
        self._files = []
        self._annotations_files = []

    def get_all_files(self, allow_types=["png", "jpg", "jpeg"]):
        allow_types += [i.upper() for i in allow_types]
        mask = r".*\.(?:" + "|".join(allow_types) + ")$"
        self._files = [
            file for file in os.listdir(self._dir_name) if re.match(mask, file)
        ]
        return self._files

    def get_exist_annotation_files(self):
        self._annotations_files = [
            file for file in os.listdir(self._dir_name) if re.match(".*.xml", file)
        ]
        return self._annotations_files

    def set_all_files(self, files):
        self._files = files

    def set_annotation_files(self, files):
        self._annotations_files = files

    def get_image(self, index):
        return self._files[index]

    def _get_next_image_helper(self, index):
        while index < len(self._files) - 1:
            index += 1
            image_file = self._files[index]
            image_file_name = image_file.split(".")[0]
            if f"{image_file_name}.xml" not in self._annotations_files:
                return index
        return None

    def get_next_annotation_image(self, index):
        image_index = self._get_next_image_helper(index)
        if image_index:
            return image_index
        if not image_index and len(self._files) != len(self._annotations_files):
            return self._get_next_image_helper(0)
import React, { useEffect, useState } from "react"
import {
  ComponentProps,
  Streamlit,
  withStreamlitConnection,
} from "streamlit-component-lib"
import { fabric } from "fabric"
import styles from "./StreamlitImgLabel.module.css"

interface Reply {
  user: string
  reply: string
  time: string
}

interface Label {
  comment: string
  time: string
  user: string
  replies: Reply[]
}

interface RectProps {
  top: number
  left: number
  width: number
  height: number
  label: Label
}

interface PythonArgs {
  canvasWidth: number
  canvasHeight: number
  rects: RectProps[]
  boxColor: string
  imageData: Uint8ClampedArray
}

const StreamlitImgLabel = (props: ComponentProps) => {
  const [mode, setMode] = useState<string>("light")
  // Store labels using a unique id for each bounding box.
  const [labels, setLabels] = useState<{ [key: number]: Label }>({})
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null)
  const { canvasWidth, canvasHeight, imageData } = props.args as PythonArgs
  // newBBoxIndex is used to generate a unique id for new boxes.
  const [newBBoxIndex, setNewBBoxIndex] = useState<number>(0)

  // Create an invisible canvas to convert the Python image data into a Data URI.
  const invisCanvas = document.createElement("canvas")
  const ctx = invisCanvas.getContext("2d")
  invisCanvas.width = canvasWidth
  invisCanvas.height = canvasHeight

  let dataUri = ""
  if (ctx) {
    const idata = ctx.createImageData(canvasWidth, canvasHeight)
    idata.data.set(imageData)
    ctx.putImageData(idata, 0, 0)
    dataUri = invisCanvas.toDataURL()
  }

  // Initialize the fabric canvas on mount and add the initial rectangles.
  useEffect(() => {
    const { rects, boxColor } = props.args as PythonArgs
    const canvasTmp = new fabric.Canvas("c", {
      enableRetinaScaling: false,
      uniScaleTransform: true,
    })

    fabric.Image.fromURL(dataUri, (img) => {
      canvasTmp.setBackgroundImage(
        img,
        canvasTmp.renderAll.bind(canvasTmp),
        {
          scaleX: canvasTmp.width! / img.width!,
          scaleY: canvasTmp.height! / img.height!,
        }
      )
    })

    // Use a counter to assign unique ids to pre-existing rectangles.
    let counter = newBBoxIndex
    const initialLabels: { [key: number]: Label } = {}

    rects.forEach((rect) => {
      const { top, left, width, height, label } = rect
      const rectObj = new fabric.Rect({
        left,
        top,
        fill: "",
        width,
        height,
        objectCaching: true,
        stroke: boxColor, // now boxColor is defined from props.args
        strokeWidth: 1,
        strokeUniform: true,
        hasRotatingPoint: false,
      });
      
      // Attach a unique id.
      (rectObj as any).customId = counter;
      
      canvasTmp.add(rectObj)
      initialLabels[counter] = label
      counter++
    })

    setNewBBoxIndex(counter)
    setLabels(initialLabels)
    setCanvas(canvasTmp)
    Streamlit.setFrameHeight()
  }, [canvasHeight, canvasWidth, dataUri])

  // Create a box by letting the user draw a rectangle.
  const defaultBox = () =>
    new Promise<{ left: number; top: number; width: number; height: number }>(
      (resolve) => {
        let firstPoint: fabric.Point | null = null
        let rect: fabric.Rect | null = null

        const handleMouseDown = (options: fabric.IEvent) => {
          if (!canvas) return
          const pointer = canvas.getPointer(options.e)
          firstPoint = new fabric.Point(pointer.x, pointer.y)
          rect = new fabric.Rect({
            left: firstPoint.x,
            top: firstPoint.y,
            fill: "rgba(255, 255, 255, 0.3)",
            stroke: "blue",
            strokeWidth: 2,
            selectable: false,
            evented: false,
          })
          canvas.add(rect)
        }

        const handleMouseMove = (options: fabric.IEvent) => {
          if (!firstPoint || !rect || !canvas) return
          const pointer = canvas.getPointer(options.e)
          const left = Math.min(firstPoint.x, pointer.x)
          const top = Math.min(firstPoint.y, pointer.y)
          const width = Math.abs(firstPoint.x - pointer.x)
          const height = Math.abs(firstPoint.y - pointer.y)
          rect.set({ left, top, width, height })
          rect.setCoords()
          canvas.renderAll()
        }

        const handleMouseUp = () => {
          if (!firstPoint || !rect || !canvas) return
          const left = rect.left ?? 0
          const top = rect.top ?? 0
          const width = rect.width ?? 0
          const height = rect.height ?? 0
          // Remove all event listeners including the mouse:down listener.
          canvas.off("mouse:down", handleMouseDown)
          canvas.off("mouse:move", handleMouseMove)
          canvas.off("mouse:up", handleMouseUp)
          // Remove the temporary drawn rect.
          canvas.remove(rect)
          resolve({ left, top, width, height })
          firstPoint = null
          rect = null
        }

        canvas?.on("mouse:down", handleMouseDown)
        canvas?.on("mouse:move", handleMouseMove)
        canvas?.on("mouse:up", handleMouseUp)
      }
    )

  // Send updated coordinates and associated labels back to Python.
  // Two fixes here:
  // 1. We update each object’s coordinates with setCoords()
  // 2. The event listener cleanup in the drawing logic avoids extra temporary objects.
  const sendCoordinates = () => {
    if (!canvas) return
    canvas.getObjects().forEach((obj) => obj.setCoords())
    const rects = canvas.getObjects().map((obj) => {
      const customId = (obj as any).customId
      return {
        ...obj.getBoundingRect(),
        label:
          labels[customId] || { comment: "", time: "", user: "", replies: [] },
      }
    })
    Streamlit.setComponentValue({ rects })
  }

  // Handler to add a new bounding box.
  const addBoxHandler = async () => {
    if (!canvas) return
    const box = await defaultBox()
    const current_time = new Date().toISOString()
    const newLabel: Label = {
      comment: "",
      time: current_time,
      user: "you",
      replies: [],
    }

    const rectObj = new fabric.Rect({
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      fill: "",
      objectCaching: true,
      stroke: (props.args as PythonArgs).boxColor,
      strokeWidth: 1,
      strokeUniform: true,
      hasRotatingPoint: false,
    })
    // Attach a unique custom id to the new rectangle.
    ;(rectObj as any).customId = newBBoxIndex
    canvas.add(rectObj)

    setLabels((prev) => ({
      ...prev,
      [newBBoxIndex]: newLabel,
    }))
    setNewBBoxIndex((prev) => prev + 1)
    sendCoordinates()
  }

  // Handler to remove the selected bounding box.
  const removeBoxHandler = () => {
    if (!canvas) return
    const selectObject = canvas.getActiveObject()
    if (!selectObject) return

    // Ensure at least one label remains.
    if (Object.keys(labels).length < 2) {
      alert("At least one label must remain. Cannot remove the last label.")
      return
    }

    // Use the unique custom id of the selected object.
    const customId = (selectObject as any).customId
    canvas.remove(selectObject)

    const newLabels = { ...labels }
    delete newLabels[customId]
    setLabels(newLabels)
    sendCoordinates()
  }

  // Reset to the rectangles provided by Python.
  const resetHandler = () => {
    if (!canvas) return
    clearHandler()
    const { rects, boxColor } = props.args as PythonArgs
    let counter = newBBoxIndex
    const newLabels: { [key: number]: Label } = {}
    rects.forEach((rect) => {
      const { top, left, width, height, label } = rect
      const rectObj = new fabric.Rect({
        left,
        top,
        fill: "",
        width,
        height,
        objectCaching: true,
        stroke: boxColor,
        strokeWidth: 1,
        strokeUniform: true,
        hasRotatingPoint: false,
      })
      ;(rectObj as any).customId = counter
      canvas.add(rectObj)
      newLabels[counter] = label
      counter++
    })
    setNewBBoxIndex(counter)
    setLabels(newLabels)
    sendCoordinates()
  }

  // Clear all bounding boxes and labels.
  const clearHandler = () => {
    if (!canvas) return
    setNewBBoxIndex(0)
    canvas.getObjects().forEach((obj) => {
      canvas.remove(obj)
    })
    setLabels({})
    sendCoordinates()
  }

  // Listen for modifications on objects so we can update coordinates.
  useEffect(() => {
    if (!canvas) return

    const handleModified = () => {
      canvas.renderAll()
      sendCoordinates()
    }

    canvas.on("object:modified", handleModified)
    return () => {
      canvas.off("object:modified", handleModified)
    }
  }, [canvas, labels])

  // Toggle UI mode.
  const onSelectMode = (mode: string) => {
    setMode(mode)
    if (mode === "dark") document.body.classList.add("dark-mode")
    else document.body.classList.remove("dark-mode")
  }

  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleDarkModeChange = (e: MediaQueryListEvent) =>
      onSelectMode(e.matches ? "dark" : "light")
    darkModeMediaQuery.addEventListener("change", handleDarkModeChange)
    onSelectMode(darkModeMediaQuery.matches ? "dark" : "light")
    return () => {
      darkModeMediaQuery.removeEventListener("change", handleDarkModeChange)
    }
  }, [])

  return (
    <>
      <canvas
        id="c"
        className={mode === "dark" ? styles.dark : ""}
        width={canvasWidth}
        height={canvasHeight}
      />
      <div className={mode === "dark" ? styles.dark : ""}>
        <button className={mode === "dark" ? styles.dark : ""} onClick={addBoxHandler}>
          Add Grounded Comment
        </button>
        <button className={mode === "dark" ? styles.dark : ""} onClick={removeBoxHandler}>
          Remove selected bbox
        </button>
        <button className={mode === "dark" ? styles.dark : ""} onClick={resetHandler}>
          Reset to previous save
        </button>
      </div>
    </>
  )
}

export default withStreamlitConnection(StreamlitImgLabel)

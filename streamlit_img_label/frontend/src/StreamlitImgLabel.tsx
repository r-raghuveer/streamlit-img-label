import React, { useEffect, useState } from "react"
import {
  ComponentProps,
  Streamlit,
  withStreamlitConnection,
} from "streamlit-component-lib"
import { fabric } from "fabric"
import styles from "./StreamlitImgLabel.module.css"

interface RectProps {
  top: number
  left: number
  width: number
  height: number
  label: string
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
  const [labels, setLabels] = useState<string[]>([])
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null)
  const { canvasWidth, canvasHeight, imageData }: PythonArgs = props.args
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
    const { rects, boxColor }: PythonArgs = props.args
    const canvasTmp = new fabric.Canvas("c", {
      enableRetinaScaling: false,
      uniScaleTransform: true,
    })

    // Load the background image using fabric.Image.fromURL.
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

    // Add any pre-existing rectangles.
    rects.forEach((rect) => {
      const { top, left, width, height } = rect
      canvasTmp.add(
        new fabric.Rect({
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
      )
    })

    setLabels(rects.map((rect) => rect.label))
    setCanvas(canvasTmp)
    Streamlit.setFrameHeight()
    // eslint-disable-next-line
  }, [canvasHeight, canvasWidth, dataUri])

  // Returns a promise that resolves to a new bounding box defined by two mouse clicks.
  const defaultBox = () => {
    return new Promise<{ left: number; top: number; width: number; height: number }>((resolve) => {
      let firstPoint: fabric.Point | null = null

      const handleCanvasClick = (options: fabric.IEvent) => {
        if (!canvas) return
        const pointer = canvas.getPointer(options.e)
        if (!firstPoint) {
          firstPoint = new fabric.Point(pointer.x, pointer.y)
        } else {
          canvas.off("mouse:down", handleCanvasClick)
          const secondPoint = new fabric.Point(pointer.x, pointer.y)
          const left = Math.min(firstPoint.x, secondPoint.x)
          const top = Math.min(firstPoint.y, secondPoint.y)
          const width = Math.abs(firstPoint.x - secondPoint.x)
          const height = Math.abs(firstPoint.y - secondPoint.y)
          resolve({ left, top, width, height })
        }
      }

      canvas?.on("mouse:down", handleCanvasClick)
    })
  }

  // Add a new bounding box to the image.
  const addBoxHandler = async () => {
    if (!canvas) return
    const box = await defaultBox()
    setNewBBoxIndex((prev) => prev + 1)
    canvas.add(
      new fabric.Rect({
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        fill: "",
        objectCaching: true,
        stroke: props.args.boxColor,
        strokeWidth: 1,
        strokeUniform: true,
        hasRotatingPoint: false,
      })
    )
    sendCoordinates([...labels, ""])
  }

  // Remove the selected bounding box.
  const removeBoxHandler = () => {
    if (!canvas) return
    const selectObject = canvas.getActiveObject()
    if (!selectObject) return
    const selectIndex = canvas.getObjects().indexOf(selectObject)
    canvas.remove(selectObject)
    const newLabels = labels.filter((label, i) => i !== selectIndex)
    sendCoordinates(newLabels)
  }

  // Reset the bounding boxes to the original ones.
  const resetHandler = () => {
    if (!canvas) return
    clearHandler()
    const { rects, boxColor }: PythonArgs = props.args
    rects.forEach((rect) => {
      const { top, left, width, height } = rect
      canvas.add(
        new fabric.Rect({
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
      )
    })
    sendCoordinates(labels)
  }

  // Remove all bounding boxes.
  const clearHandler = () => {
    if (!canvas) return
    setNewBBoxIndex(0)
    canvas.getObjects().forEach((obj) => {
      canvas.remove(obj)
    })
    sendCoordinates([])
  }

  // Send the coordinates of the rectangles back to Streamlit.
  const sendCoordinates = (returnLabels: string[]) => {
    setLabels(returnLabels)
    if (!canvas) return
    const rects = canvas.getObjects().map((obj, i) => ({
      ...obj.getBoundingRect(),
      label: returnLabels[i] || "",
    }))
    Streamlit.setComponentValue({ rects })
  }

  // Update bounding boxes when they are modified.
  useEffect(() => {
    if (!canvas) return

    const handleEvent = () => {
      canvas.renderAll()
      sendCoordinates(labels)
    }

    canvas.on("object:modified", handleEvent)
    return () => {
      canvas.off("object:modified", handleEvent)
    }
  }, [canvas, labels])

  // Adjust the theme based on the system setting.
  const onSelectMode = (mode: string) => {
    setMode(mode)
    if (mode === "dark") document.body.classList.add("dark-mode")
    else document.body.classList.remove("dark-mode")
  }

  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleDarkModeChange = (e: MediaQueryListEvent) => onSelectMode(e.matches ? "dark" : "light")
    darkModeMediaQuery.addEventListener("change", handleDarkModeChange)

    // Set the initial mode.
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
        <button
          className={mode === "dark" ? styles.dark : ""}
          onClick={addBoxHandler}
        >
          Add bounding box
        </button>
        <button
          className={mode === "dark" ? styles.dark : ""}
          onClick={removeBoxHandler}
        >
          Remove select
        </button>
        <button
          className={mode === "dark" ? styles.dark : ""}
          onClick={resetHandler}
        >
          Reset
        </button>
        <button
          className={mode === "dark" ? styles.dark : ""}
          onClick={clearHandler}
        >
          Clear all
        </button>
      </div>
    </>
  )
}

export default withStreamlitConnection(StreamlitImgLabel)

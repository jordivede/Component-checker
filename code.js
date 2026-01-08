// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// Function to recursively find all component instances in a node with hierarchy
function findAllComponentInstances(node, level = 0, parentPath = []) {
  const instances = [];
  const currentPath = [...parentPath];
  
  if (node.type === 'INSTANCE') {
    instances.push({
      node: node,
      level: level,
      parentPath: currentPath,
      parentName: currentPath.length > 0 ? currentPath[currentPath.length - 1] : null
    });
    // Add this instance to the path for its children
    currentPath.push(node.name);
  }
  
  if ('children' in node) {
    for (const child of node.children) {
      instances.push(...findAllComponentInstances(child, level + (node.type === 'INSTANCE' ? 1 : 0), currentPath));
    }
  }
  
  return instances;
}

// Function to check if a component is properly linked to a library
async function isComponentLinked(instance) {
  try {
    // Use getMainComponentAsync for dynamic-page document access
    const mainComponent = await instance.getMainComponentAsync();
    
    if (!mainComponent) {
      return false;
    }
    
    // Check if the main component is from a remote library
    // Remote components have the 'remote' property set to true
    // Only components from external libraries are considered properly linked
    return mainComponent.remote === true;
  } catch (error) {
    // If we can't check, assume it's not properly linked
    return false;
  }
}

// Function to scan a frame for component linking issues
async function scanFrameForComponents(frame) {
  const issues = [];
  const instances = findAllComponentInstances(frame);
  
  // Create a map to track parent IDs
  const parentIdMap = new Map();
  
  for (const instanceData of instances) {
    const instance = instanceData.node;
    const isLinked = await isComponentLinked(instance);
    if (!isLinked) {
      // Find parent ID if exists
      let parentId = null;
      if (instanceData.parentPath && instanceData.parentPath.length > 0) {
        // Try to find the parent instance ID
        const parentInstance = instances.find(inst => 
          inst.node.name === instanceData.parentPath[instanceData.parentPath.length - 1] &&
          inst.level === instanceData.level - 1
        );
        if (parentInstance) {
          parentId = parentInstance.node.id;
        }
      }
      
      issues.push({
        name: instance.name,
        id: instance.id,
        type: 'NOT_LINKED',
        level: instanceData.level,
        parentPath: instanceData.parentPath,
        parentName: instanceData.parentName,
        parentId: parentId
      });
      
      // Store this component's ID for children lookup
      parentIdMap.set(instance.id, instance.name);
    }
  }
  
  return {
    totalComponents: instances.length,
    totalIssues: issues.length,
    issues: issues,
    frameName: frame.name
  };
}

// Runs this code if the plugin is run in Figma
if (figma.editorType === 'figma') {
  // Show the HTML page
  figma.showUI(__html__, { width: 640, height: 300 });

  // Handle messages from the UI
  figma.ui.onmessage = async (msg) => {
    if (msg.type === 'scan-frame') {
      // Check if a frame is selected
      const selection = figma.currentPage.selection;
      
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un frame para escanear.'
        });
        return;
      }
      
      const selectedNode = selection[0];
      
      // Check if the selected node is a frame
      if (selectedNode.type !== 'FRAME' && selectedNode.type !== 'COMPONENT' && selectedNode.type !== 'COMPONENT_SET') {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un Frame, Component o Component Set.'
        });
        return;
      }
      
      // Scan the frame for component issues
      const scanResult = await scanFrameForComponents(selectedNode);
      
      // Send results back to UI
      figma.ui.postMessage({
        type: 'scan-result',
        result: scanResult
      });
    }
    
    if (msg.type === 'cancel') {
      figma.closePlugin();
    }
    
    if (msg.type === 'resize-ui') {
      // Resize the UI based on content height
      figma.ui.resize(640, msg.height);
    }
    
    if (msg.type === 'select-component') {
      // Select the component by ID using async method for dynamic-page access
      try {
        const node = await figma.getNodeByIdAsync(msg.componentId);
        if (node) {
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
        } else {
          figma.ui.postMessage({
            type: 'selection-error',
            error: 'No se pudo encontrar el componente.'
          });
        }
      } catch (error) {
        figma.ui.postMessage({
          type: 'selection-error',
          error: 'Error al seleccionar el componente: ' + error.message
        });
      }
    }
  };
}

// Runs this code if the plugin is run in FigJam
if (figma.editorType === 'figjam') {
  figma.showUI(__html__, { width: 640, height: 300 });

  figma.ui.onmessage = async (msg) => {
    if (msg.type === 'scan-frame') {
      const selection = figma.currentPage.selection;
      
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un frame para escanear.'
        });
        return;
      }
      
      const selectedNode = selection[0];
      
      if (selectedNode.type !== 'FRAME' && selectedNode.type !== 'COMPONENT' && selectedNode.type !== 'COMPONENT_SET') {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un Frame, Component o Component Set.'
        });
        return;
      }
      
      const scanResult = await scanFrameForComponents(selectedNode);
      
      figma.ui.postMessage({
        type: 'scan-result',
        result: scanResult
      });
    }
    
    if (msg.type === 'cancel') {
      figma.closePlugin();
    }
    
    if (msg.type === 'resize-ui') {
      // Resize the UI based on content height
      figma.ui.resize(640, msg.height);
    }
    
    if (msg.type === 'select-component') {
      try {
        const node = figma.getNodeById(msg.componentId);
        if (node) {
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
        } else {
          figma.ui.postMessage({
            type: 'selection-error',
            error: 'No se pudo encontrar el componente.'
          });
        }
      } catch (error) {
        figma.ui.postMessage({
          type: 'selection-error',
          error: 'Error al seleccionar el componente: ' + error.message
        });
      }
    }
  };
}

// Runs this code if the plugin is run in Slides
if (figma.editorType === 'slides') {
  figma.showUI(__html__, { width: 640, height: 300 });

  figma.ui.onmessage = async (msg) => {
    if (msg.type === 'scan-frame') {
      const selection = figma.currentPage.selection;
      
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un frame para escanear.'
        });
        return;
      }
      
      const selectedNode = selection[0];
      
      if (selectedNode.type !== 'FRAME' && selectedNode.type !== 'COMPONENT' && selectedNode.type !== 'COMPONENT_SET') {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un Frame, Component o Component Set.'
        });
        return;
      }
      
      const scanResult = await scanFrameForComponents(selectedNode);
      
      figma.ui.postMessage({
        type: 'scan-result',
        result: scanResult
      });
    }
    
    if (msg.type === 'cancel') {
      figma.closePlugin();
    }
    
    if (msg.type === 'resize-ui') {
      // Resize the UI based on content height
      figma.ui.resize(640, msg.height);
    }
    
    if (msg.type === 'select-component') {
      try {
        const node = figma.getNodeById(msg.componentId);
        if (node) {
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
        } else {
          figma.ui.postMessage({
            type: 'selection-error',
            error: 'No se pudo encontrar el componente.'
          });
        }
      } catch (error) {
        figma.ui.postMessage({
          type: 'selection-error',
          error: 'Error al seleccionar el componente: ' + error.message
        });
      }
    }
  };
}

// Runs this code if the plugin is run in Buzz
if (figma.editorType === 'buzz') {
  figma.showUI(__html__, { width: 640, height: 300 });

  figma.ui.onmessage = async (msg) => {
    if (msg.type === 'scan-frame') {
      const selection = figma.currentPage.selection;
      
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un frame para escanear.'
        });
        return;
      }
      
      const selectedNode = selection[0];
      
      if (selectedNode.type !== 'FRAME' && selectedNode.type !== 'COMPONENT' && selectedNode.type !== 'COMPONENT_SET') {
        figma.ui.postMessage({
          type: 'scan-result',
          error: 'Por favor, selecciona un Frame, Component o Component Set.'
        });
        return;
      }
      
      const scanResult = await scanFrameForComponents(selectedNode);
      
      figma.ui.postMessage({
        type: 'scan-result',
        result: scanResult
      });
    }
    
    if (msg.type === 'cancel') {
      figma.closePlugin();
    }
    
    if (msg.type === 'resize-ui') {
      // Resize the UI based on content height
      figma.ui.resize(640, msg.height);
    }
    
    if (msg.type === 'select-component') {
      try {
        const node = figma.getNodeById(msg.componentId);
        if (node) {
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
        } else {
          figma.ui.postMessage({
            type: 'selection-error',
            error: 'No se pudo encontrar el componente.'
          });
        }
      } catch (error) {
        figma.ui.postMessage({
          type: 'selection-error',
          error: 'Error al seleccionar el componente: ' + error.message
        });
      }
    }
  };
}

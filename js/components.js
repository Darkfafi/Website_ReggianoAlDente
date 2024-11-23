document.body.style.visibility = 'hidden';

document.addEventListener('DOMContentLoaded', () => {
    injectComponents()
        .then(() => {
            // Visuals
            document.body.style.visibility = 'visible';
            window.scrollTo(0, 0);

            // Callback
            document.dispatchEvent(new Event('inject-completed'));
            console.log("inject-completed");
        });
});

async function injectComponents() {

    const attr = "inject-component";
    let stack = Array.from(document.querySelectorAll(`[${attr}]`)).map(element => {
        const attrValue = element.getAttribute(attr);
        element.removeAttribute(attr); // Remove the attribute immediately to prevent duplication
        return { element, componentNames: attrValue ? attrValue.split(',').map(name => name.trim()) : [] };
    });

    stack.reverse();

    while (stack.length > 0) {
        const instruction = stack.pop(); // Process the last instruction in the stack
        const { element, componentNames } = instruction;
        
        for (const componentName of componentNames) {
            try {
                await processComponent(element, componentName); // Process the component
            } catch (error) {
                console.error(`Error processing component ${componentName}:`, error);
            }
        }

        // Check for any new elements with `inject-component` added by this component
        const newElements = Array.from(document.querySelectorAll(`[${attr}]`)).map(newElement => {
            const newAttrValue = newElement.getAttribute(attr);
            newElement.removeAttribute(attr); // Remove the attribute immediately
            return { element: newElement, componentNames: newAttrValue ? newAttrValue.split(',').map(name => name.trim()) : [] };
        });

        stack.push(...newElements); // Add new instructions to the stack
    }
}

async function processComponent(parentElement, componentName) {
    const response = await fetch(`components/${componentName}.html`);
    if (!response.ok) throw new Error(`Failed to load ${componentName}`);
    
    let data = await response.text();

    // Handle key-* attribute replacements
    const keys = Array.from(parentElement.attributes)
        .filter(attr => attr.name.startsWith('key-'))
        .map(attr => ({
            key: attr.name.replace('key-', '').toUpperCase(),
            value: attr.value
        }));

    keys.forEach(({ key, value }) => {
        const placeholder = `[${key}]`;
        const regex = new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'); // Escape special characters in the placeholder
        data = data.replace(regex, value);
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(data, 'text/html');

    const queue = []; // Queue to handle all elements in order

    // Add <link> tags to the queue
    doc.querySelectorAll('link').forEach(linkTag => {
        queue.push(() => processLink(linkTag));
    });

    // Add <style> tags to the queue
    doc.querySelectorAll('style').forEach(styleTag => {
        queue.push(() => processStyle(styleTag));
    });

    // Add <script> tags to the queue
    doc.querySelectorAll('script').forEach(scriptTag => {
        queue.push(() => processScript(scriptTag));
    });

    var tempElements = [];

    // Add other content to replace or append to the parent element
    if (parentElement.hasAttribute('inject-replace')) {
        
        var parent = parentElement.parentElement;
        
        var referenceElement = document.createElement('div');
        parent.insertBefore(referenceElement, parentElement);
        tempElements.push(referenceElement);
        parentElement.remove();

        Array.from(doc.body.childNodes).forEach(node => {
            queue.push(() => 
                {
                    parent.insertBefore(document.importNode(node, true), referenceElement);
                }
            );
        });
    } else {
        const wrapper = document.createElement('div');
        Array.from(doc.body.childNodes).forEach(node => {
            wrapper.appendChild(document.importNode(node, true));
        });
        queue.push(() => parentElement.appendChild(wrapper));
    }

    // Process all queued tasks sequentially
    for (const task of queue) 
    {
        await task();
    }

    // Remove all tempElements
    for(const tempElement of tempElements)
    {
        tempElement.remove();
    }
}

function processLink(linkTag) {
    return new Promise(resolve => {
        const link = document.createElement('link');
        Array.from(linkTag.attributes).forEach(attr => {
            link.setAttribute(attr.name, attr.value);
        });
        document.head.appendChild(link);
        resolve();
    });
}

function processStyle(styleTag) {
    return new Promise(resolve => {
        const style = document.createElement('style');
        style.textContent = styleTag.textContent;
        document.head.appendChild(style);
        resolve();
    });
}

function processScript(scriptTag) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        if (scriptTag.src) {
            script.src = scriptTag.src;
            script.async = false; // Ensure sequential execution
            script.defer = false; // Prevents defer behavior for dynamic scripts
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${script.src}`));
            document.head.appendChild(script);
        } else {
            script.textContent = scriptTag.textContent;
            document.head.appendChild(script);
            resolve(); // Inline scripts execute immediately
        }
    });
}

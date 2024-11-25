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
    
    // Replace variables in the content (KEY Specified)
    data = await replaceVariables(data, true);

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
    
    // Replace variables in the content
    data = await replaceVariables(data, false);

    const parser = new DOMParser();
    const doc = parser.parseFromString(data, 'text/html');

    const queue = []; // Queue to handle all elements in order

    // Add <meta> tags to the queue
    doc.querySelectorAll('meta').forEach(metaTag => {
        queue.push(() => processMeta(metaTag));
    });

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

function processMeta(metaTag) {
    return new Promise(resolve => {
        const meta = document.createElement('meta');
        Array.from(metaTag.attributes).forEach(attr => {
            meta.setAttribute(attr.name, attr.value);
        });
        document.head.appendChild(meta);
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

const configCache = {}; // Cache for loaded configuration files

async function fetchConfig(configName) {
    if (configCache[configName]) {
        return configCache[configName];
    }

    const response = await fetch(`configs/${configName}.txt`);
    if (!response.ok) throw new Error(`Failed to load config: ${configName}`);

    const configText = await response.text();
    const config = configText.split('\n').reduce((acc, line) => {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
            acc[key.trim()] = valueParts.join(':').trim();
        }
        return acc;
    }, {});

    configCache[configName] = config;
    return config;
}

async function replaceVariables(content, detectKey) {
    const variableRegex =  detectKey === true ? /\[(key:[a-zA-Z0-9_.]+)\]/g : /\[([a-zA-Z0-9_.]+)\]/g;
    let match;
    const replacements = {};

    while ((match = variableRegex.exec(content)) !== null) {
        const fullKey = match[1]; // e.g., main_config.name
        const [configName, key] = fullKey.split('.');
        if (!configName || !key) continue;

        if (!replacements[fullKey]) {
            try {
                const config = await fetchConfig(configName.replace("key:", ''));
                replacements[fullKey] = config[key] || '';
            } catch (error) {
                console.error(`Error fetching variable ${fullKey}:`, error);
                replacements[fullKey] = ''; // Default to empty string if an error occurs
            }
        }
    }

    // Perform replacements
    Object.entries(replacements).forEach(([variable, value]) => {
        const regex = new RegExp(`\\[${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g');
        content = content.replace(regex, value);
    });

    return content;
}
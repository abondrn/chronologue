const readline = require("readline");
const fs = require('fs').promises;

const { OpenAI } = require("openai");
const prompts = require('@inquirer/prompts');
const xml = require('@xmldom/xmldom');

const { readYamlFile } = require('./auth');


function lookup(scope, name) {
    if (scope.bindings.hasOwnProperty(name)) {
        return scope.bindings[name];
    } else if (scope.parent === null) {
        return undefined;
    } else {
        return lookup(scope.parent, name);
    }
}


function replaceVariables(inputString, scope) {
    // Create a regular expression to match $x where x is any word character
    const regex = /\$([\w]+)/g;

    // Use the replace method with a function to perform the replacement
    const replacedString = inputString.replace(regex, (match, variableName) => {
        // Check if the variable exists in the dictionary
        const check = lookup(scope, variableName);
        console.log(variableName, check);
        if (check !== undefined) {
            // Return the corresponding value from the dictionary
            return check;
        } else {
            // If the variable doesn't exist in the dictionary, return the original match
            return match;
        }
    });

    return replacedString;
}


function map1(key, value) {
    const obj = {};
    obj[key] = value;
    return obj;
}


// TODO: support entities
function xmlToJson(node) {
    // If the node is a text node, return its text content
    if (node.nodeType === node.TEXT_NODE) {
        return node.nodeValue;
    }


    // Initialize the result object
    const obj: any = {attr: {}, elem: []};
    // If the node has attributes, add them to the result object
    if (node.nodeType === node.ELEMENT_NODE) {
        obj.tag = node.nodeName;
        for (let i = 0; i < node.attributes.length; i++) {
            const attr = node.attributes.item(i);
            obj['attr'][attr.nodeName] = attr.nodeValue;
        }
    } else if (node.nodeType === node.COMMENT_NODE) {
        obj.tag = 'comment';
        obj.elem.push(node.nodeValue);
    } else {
        console.log(node.nodeType);
    }

    // If the node has child nodes, recursively process them
    if (node.hasChildNodes()) {
        let currentNode = node.firstChild;
        while (currentNode) {
            obj['elem'].push(xmlToJson(currentNode));
            currentNode = currentNode.nextSibling;
        }
    }

    return obj;
}


function jsonToXml(json) {
    const document = new xml.DOMImplementation().createDocument('', '', null);
    const dom = jsonToXmlHelper(json, document, null);
    return dom;
}


function jsonToXmlHelper(json, document, parent) {
    if (typeof json === 'object') {
        const childNode = (json.tag === 'comment'
            ? document.createComment(json.elem[0])
            : document.createElement(json.tag));
            
        const attributes = json.attr;
        for (const attrName in attributes) {
            const attrValue = attributes[attrName];
            childNode.setAttribute(attrName, attrValue);
        }
        if (json.tag != 'comment') {
            for (const item of json.elem) {
                jsonToXmlHelper(item, document, childNode);
            }
        }

        if (parent !== null) {
            parent.appendChild(childNode);
        } else {
            document.insertBefore(childNode);
        }
    } else {
        const textNode = document.createTextNode(json);
        if (parent !== null) {
            parent.appendChild(textNode);
        } else {
            document.insertBefore(textNode);
        }
    }

    return document;
}


function parseParam(node) {
    const param: any = {};
    let item = param;

    if (node.attr.hasOwnProperty('array')) {
        param.type = 'array';
        item = {type: node.attr.array};
        param.items = item;
    }
    if (node.elem.length !== 0 && !node.attr.hasOwnProperty('type') || node.attr.hasOwnProperty('type') === 'object') {
        item.type = 'object';
        item.properties = {};
        item.required =  [];
        for (const elem of node.elem) {
            if (typeof elem === 'object' && (elem.tag === 'p' || elem.tag === 'opt')) {
                item.properties[elem.attr.name] = parseParam(elem);
                if (elem.tag === 'p') {
                    item.required.push(elem.attr.name);
                }
            }
        }
    } else {
        for (const attr in node.attr) {
            if (['minItems', 'maxItems', 'minLength', 'maxLength'].includes(attr)) {
                item[attr] = parseInt(node.attr[attr], 10);
            } else if (attr === 'd') {
                item.description = node.attr.d;
            } else if (!['d', 'action', 'array', 'name'].includes(attr)) {
                item[attr] = node.attr[attr];
            }
        }
        if (!item.hasOwnProperty('type')) {
            item.type = 'string';
        }
        for (const elem of node.elem) {
            if (typeof elem === 'object' && elem.tag === 'opt') {
                if (!item.hasOwnProperty('enum')) param.enum = [];
                item.enum.push(elem.attr.value);
            }
        }
    }
    return param;
}


// TODO: choice
async function evaluateChat(nodes, parentScope, context) {
    const messages: any[] = [];
    const tools: any[] = [];
    const scope = {parent: parentScope, bindings: {}};

    for (const node of nodes) {
        if (typeof node === 'string') {
            continue;
        }
        switch (node.tag) {
            case 'system': 
            case 'user':
                const content = replaceVariables(node.elem[0].trim().replace('\t', ''), scope);
                messages.push({ role: node.tag, content });
                break;

            case 'p':
                const answer = await prompts.input({ message: node.attr.user });
                scope.bindings[node.attr.store] = answer;
                break;

            case 'tool':
                let param = parseParam(node);
                if (param.type !== 'object') {
                    param = {type: 'object', properties: map1('input', param), required: ['input']};
                }
                tools.push({
                    type: 'function',
                    function: {
                        name: node.attr.name,
                        description: node.attr.d,
                        parameters: param,
                    },
                });
                break;
            
            case 'response':
                await chatLoop(messages, tools, context, context.callbacks);
                break;
        }
    }
    return {
        scope: scope,
    };
}


async function chatLoop(messages: any[], tools: any[], context, callbacks, model: string = "gpt-3.5-turbo-1106") {
    let done = false;
    console.log(JSON.stringify(tools, null, 2));
    while (!done) {
        done = true; // might get overridden
        let response;
        if (tools.length > 0) {
            console.log(messages);
            response = await context.openai.chat.completions.create({
                model: model,
                messages,
                tools: tools,
                tool_choice: "auto", // auto is default, but we'll be explicit
            });
            console.log({
                created: response.created,
                model: response.model,
                usage: response.usage,
                choices: response.choices,
            });
            messages.push({
                role: "assistant",
                tool_calls: response.choices[0].message.tool_calls,
            })
            const calls = response.choices[0].message.tool_calls.map((call) => {
                return {
                    id: call.id,
                    name: call.function.name,
                    arguments: JSON.parse(call.function.arguments),
                };
            });
            console.log(JSON.stringify(calls, null, 2));
            for (const call of calls) {
                if (!callbacks.hasOwnProperty(call.name)) {
                    messages.push({
                        tool_call_id: call.id,
                        role: "tool",
                        name: call.name,
                        content: `${call.name} is not one of the provided tools`,
                    });
                    return;
                }
                const res = await callbacks[call.name](call.arguments, context);
                
                // TODO: confirm
                let content;
                if (res.action === "loop") {
                    content = res.content;
                    done = false;
                } else if (res.action === "feedback") {
                    console.log(call.arguments);
                    const answer = await context.input("Review the output and see if it matches your expectations. Enter your feedback, or skip to accept.");
                    if (answer.trim() === "") {
                        content = "Accepted";
                        if (res.success) res.success();
                    } else {
                        content = answer;
                        done = false;
                        if (res.failure) res.failure();
                    }
                } else if (res.action === "noop") {
                    return;
                }
                messages.push({
                    tool_call_id: call.id,
                    role: "tool",
                    name: call.name,
                    content,
                });
            }
        } else {
            response = await context.openai.chat.completions.create({
                model: model,
                messages,
            });
            console.log({
                created: response.created,
                model: response.model,
                usage: response.usage,
                choices: response.choices,
            });
            messages.push({
                role: "assistant",
                content: response.choices[0].message.content,
            })
            console.log(response.choices[0].message);
        }
    }
}


function parseGen(node, scope) {
    const messages: any[] = [];

    let feedback: boolean = false;
    for (const elem of node.elem) {
        if (typeof elem === 'string') {
            continue;
        }
        switch (elem.tag) {
            case 'system': 
            case 'user':
                const content = replaceVariables(elem.elem[0].trim().replace('\t', ''), scope);
                messages.push({ role: elem.tag, content });
                break;
            
            case 'feedback':
                feedback = true;
                break;
        }
    }

    let param = parseParam(node);
    let singleton = false;
    if (param.type !== 'object') {
        param = {type: 'object', properties: map1('input', param), required: ['input']};
        singleton = true;
    }
    const tools = [
        {
            type: 'function',
            function: {
                name: node.attr.store,
                parameters: param,
            },
        }
    ];

    return {
        messages,
        tools,
        feedback,
        singleton,
    }
}


async function evaluateGen(node, scope, context) {
    const {
        messages,
        tools,
        feedback,
    } = parseGen(node, scope);
    
    const label = node.attr.store;
    const callbacks = map1(label, async (args, ctx) => {
        const store = () => {
            console.log(label);
            console.log(args);
            scope.bindings[label] = args;
        };
        if (!feedback) {
            store();
            return {
                action: 'noop',
            }
        } else {
            return {
                action: 'feedback',
                success: store,
            }
        }
    });
    await chatLoop(messages, tools, context, callbacks);

    return {};
}


async function evaluateEach(node, parentScope, context) {
    console.log(parentScope);
    const label = node.attr.store;
    const over = lookup(parentScope, node.attr.in);
    if (over === undefined) {
        throw new Error(`could not find '${node.attr.in}' in scope`);
    }
    for (const each of over.input) {
        const scope = {parent: parentScope, bindings: each};
        const {
            messages,
            tools,
            feedback,
        } = parseGen(node, scope);

        const callbacks = map1(label, async (args, ctx) => {
            const store = () => each[label] = args;
            if (!feedback) {
                store();
                return {
                    action: 'noop',
                }
            } else {
                return {
                    action: 'feedback',
                    success: store,
                }
            }
        });
        await chatLoop(messages, tools, context, callbacks);
    }

    return {};
}


// TODO: template and sub
// TODO: loop
// TODO: task
// TODO: revise
// TODO: plugin
// TODO: complete
// TODO: configure model / temperature
async function evaluateHelper(nodes, parentScope, context) {
    const scope = {parent: parentScope, bindings: {}};
    for (const node of nodes) {
        if (typeof node === 'string') {
            continue;
        }
        switch (node.tag) {
            case 'p':
                const answer = await prompts.input({ message: node.attr.user });
                const param = parseParam(node);
                scope.bindings[node.attr.store] = answer;
                break;
            
            case 'chat':
                await evaluateChat(node.elem, scope, context);
                break;
            
            case 'gen':
                await evaluateGen(node, scope, context);
                break;
            
            case 'each':
                await evaluateEach(node, scope, context);
                break;
        }
    }
    return {
        scope: scope,
    };
}


export function parseXml(src) {
    return new xml.DOMParser().parseFromString(src, "text/xml")
}


export function dumpXml(doc) {
    return new xml.XMLSerializer().serializeToString(doc);
}


export async function evaluate(node) {
    const { openai: { token }, checkvist } = await readYamlFile('config.yaml');
    const ctx = {
        openai: new OpenAI({ apiKey: token }),
        input: async (user) => await prompts.input({ message: user }),
        callbacks: {
            ask: async (args, ctx) => {
                return {
                    action: 'loop',
                    content: ctx.input(args.input),
                }
            },
            // TODO: code interpreter
            // TODO: linter
            // TODO: check libraries
            code: async (args, ctx) => {
                if (!args.complete) {
                    return {
                        action: 'noop',
                    }
                } else {
                    return {
                        action: 'feedback',
                    }
                }
            },
        },
    }
    
    return await evaluateHelper(node.elem, {parent: null, bindings: {}}, ctx);
}


function read(src: string) {
    return xmlToJson(parseXml(src).documentElement);
}


export async function readEvaluatePrint(src: string) {
    console.log(await evaluate(read(src)));
}


export async function executeFile(path: string) {
    const src = await fs.readFile(path, 'utf8');
    await readEvaluatePrint(src);
}
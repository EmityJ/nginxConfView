document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const configTree = document.getElementById('configTree');
    const configDetails = document.getElementById('configDetails');
    const detailsSection = document.getElementById('detailsSection');

    // 图表容器
    const topologyChart = document.getElementById('topologyChart');
    const routesChart = document.getElementById('routesChart');
    const serversChart = document.getElementById('serversChart');

    // 初始化echarts实例
    const topologyInstance = echarts.init(topologyChart);
    const routesInstance = echarts.init(routesChart);
    let serversInstance = null; // 服务器实例将按需创建

    // 选项卡切换
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // 更新活动选项卡按钮
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // 更新活动内容面板
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            
            // 调整图表大小以适应容器
            if (tabName === 'topology') {
                topologyInstance.resize();
            } else if (tabName === 'routes') {
                routesInstance.resize();
            }
        });
    });

    // 初始隐藏详情部分
    detailsSection.style.display = 'none';

    // 拖放文件事件处理
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.classList.add('highlight');
    }

    function unhighlight() {
        dropArea.classList.remove('highlight');
    }

    // 处理拖放文件
    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    // 处理文件选择
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.conf')) {
                readFile(file);
            } else {
                alert('请上传.conf格式的文件');
            }
        }
    }

    // 读取文件内容
    function readFile(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                const parsedConfig = parseNginxConfig(content);
                
                // 显示详情部分
                detailsSection.style.display = 'block';
                
                // 处理配置数据并更新可视化
                try {
                    processConfigData(parsedConfig);
                } catch (visualError) {
                    console.error('可视化配置数据时出错:', visualError);
                    showError('生成图表时出错，请检查配置文件格式。错误: ' + visualError.message);
                }
                
                // 显示树形结构
                try {
                    displayConfigTree(parsedConfig);
                } catch (treeError) {
                    console.error('显示树形结构时出错:', treeError);
                    configTree.innerHTML = '<div class="error-message">显示树形结构时出错: ' + treeError.message + '</div>';
                }
                
                // 默认显示空白详情区域
                configDetails.innerHTML = '<div class="empty-message">选择一个指令以查看详细信息</div>';
            } catch (error) {
                console.error('处理配置文件时出错:', error);
                showError('处理配置文件时出错: ' + error.message);
            }
        };
        
        reader.onerror = function(e) {
            console.error('读取文件时出错:', e);
            showError('读取文件时出错, 请重试。');
        };
        
        reader.readAsText(file);
    }

    // 显示错误信息
    function showError(message) {
        // 在所有视图中显示错误信息
        configTree.innerHTML = '<div class="error-message">' + message + '</div>';
        
        // 清空图表并显示错误
        topologyInstance.clear();
        routesInstance.clear();
        if (serversInstance) {
            serversInstance.clear();
        }
        
        const errorOption = {
            title: {
                text: '错误',
                top: 'top',
                left: 'center',
                textStyle: {
                    color: '#e74c3c'
                }
            },
            graphic: {
                elements: [{
                    type: 'text',
                    style: {
                        text: message,
                        x: 'center',
                        y: 'middle',
                        fill: '#e74c3c',
                        fontSize: 16
                    }
                }]
            }
        };
        
        topologyInstance.setOption(errorOption);
        routesInstance.setOption(errorOption);
        if (serversInstance) {
            serversInstance.setOption(errorOption);
        }
    }

    // 解析Nginx配置
    function parseNginxConfig(content) {
        try {
            // 移除注释和空行
            content = content.replace(/#.*$/gm, '');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            
            // 定义根节点
            const root = {
                type: 'root',
                children: []
            };
            
            let currentContext = [root];
            let currentIndent = 0;
            
            lines.forEach(line => {
                try {
                    line = line.trim();
                    
                    // 处理块的开始和结束
                    if (line.endsWith('{')) {
                        // 解析指令和参数
                        const blockLine = line.slice(0, -1).trim();
                        const parts = blockLine.split(/\s+/);
                        const directive = parts[0];
                        const params = parts.slice(1);
                        
                        // 创建新的块节点
                        const newBlock = {
                            type: 'block',
                            directive: directive,
                            params: params,
                            children: []
                        };
                        
                        // 添加到当前上下文
                        currentContext[currentContext.length - 1].children.push(newBlock);
                        
                        // 更新上下文
                        currentContext.push(newBlock);
                        currentIndent++;
                    } 
                    else if (line === '}') {
                        // 块结束，弹出上下文
                        if (currentContext.length > 1) {
                            currentContext.pop();
                            currentIndent--;
                        }
                    } 
                    else {
                        // 简单的指令
                        const parts = line.split(/\s+/);
                        // 处理以分号结尾的行
                        let lastPart = '';
                        if (parts.length > 0) {
                            lastPart = parts[parts.length - 1];
                            if (lastPart.endsWith(';')) {
                                parts[parts.length - 1] = lastPart.slice(0, -1);
                                if (parts[parts.length - 1] === '') {
                                    parts.pop();
                                }
                            }
                        }
                        
                        // 确保有有效的指令
                        if (parts.length > 0 && parts[0].trim() !== '') {
                            const directive = {
                                type: 'directive',
                                directive: parts[0],
                                params: parts.slice(1)
                            };
                            
                            // 添加到当前上下文
                            if (currentContext.length > 0) {
                                currentContext[currentContext.length - 1].children.push(directive);
                            }
                        }
                    }
                } catch (lineError) {
                    console.warn('解析行时出错:', line, lineError);
                    // 继续处理下一行
                }
            });
            
            return root;
        } catch (error) {
            console.error('解析配置时出错:', error);
            // 返回空的根节点
            return { type: 'root', children: [] };
        }
    }

    // 处理配置数据并更新可视化
    function processConfigData(config) {
        // 提取服务器、上游服务器和代理路径
        const servers = [];
        const upstreams = {};
        const routes = [];
        
        // 递归提取配置信息
        function extractConfig(node, context = {}) {
            if (node.type === 'root') {
                node.children.forEach(child => extractConfig(child));
            }
            else if (node.type === 'block') {
                if (node.directive === 'http') {
                    node.children.forEach(child => extractConfig(child));
                }
                else if (node.directive === 'server') {
                    const server = {
                        name: '',
                        listen: [],
                        locations: []
                    };
                    
                    node.children.forEach(child => {
                        if (child.directive === 'server_name' && child.params.length > 0) {
                            server.name = child.params[0];
                        }
                        else if (child.directive === 'listen') {
                            server.listen.push(child.params.join(' '));
                        }
                        else if (child.type === 'block' && child.directive === 'location') {
                            extractConfig(child, { server: server });
                        }
                    });
                    
                    servers.push(server);
                }
                else if (node.directive === 'location') {
                    const path = node.params.length > 0 ? node.params.join(' ') : '/';
                    const location = {
                        path: path,
                        proxyPass: null,
                        root: null
                    };
                    
                    node.children.forEach(child => {
                        if (child.directive === 'proxy_pass') {
                            location.proxyPass = child.params.join(' ');
                            
                            if (context.server) {
                                routes.push({
                                    from: `${context.server.name}${path}`,
                                    to: location.proxyPass
                                });
                            }
                        }
                        else if (child.directive === 'root') {
                            location.root = child.params.join(' ');
                        }
                    });
                    
                    if (context.server) {
                        context.server.locations.push(location);
                    }
                }
                else if (node.directive === 'upstream') {
                    const name = node.params.length > 0 ? node.params[0] : '';
                    const servers = [];
                    
                    node.children.forEach(child => {
                        if (child.directive === 'server') {
                            servers.push(child.params.join(' '));
                        }
                    });
                    
                    upstreams[name] = servers;
                }
            }
        }
        
        extractConfig(config);
        
        // 创建服务拓扑图
        createTopologyChart(servers, upstreams, routes);
        
        // 创建路由规则图
        createRoutesChart(routes, upstreams);
        
        // 创建服务器配置图
        createServersChart(servers);
    }

    // 创建服务拓扑图
    function createTopologyChart(servers, upstreams, routes) {
        const data = [];
        const links = [];
        
        // 检查是否有服务器或上游服务器
        if (servers.length === 0 && Object.keys(upstreams).length === 0) {
            // 如果没有数据，显示空图表
            const option = {
                title: {
                    text: 'Nginx服务拓扑图 (无数据)',
                    top: 'top',
                    left: 'center'
                },
                tooltip: {
                    show: false
                },
                series: []
            };
            
            topologyInstance.setOption(option);
            return;
        }
        
        // 添加客户端节点
        data.push({
            name: '客户端',
            value: 10,
            category: 0,
            symbolSize: 50,
            itemStyle: {
                color: '#5470c6'
            }
        });
        
        // 添加Nginx节点
        data.push({
            name: 'Nginx',
            value: 20,
            category: 1,
            symbolSize: 70,
            itemStyle: {
                color: '#91cc75'
            }
        });
        
        // 客户端到Nginx的连接
        links.push({
            source: '客户端',
            target: 'Nginx',
            value: 1
        });
        
        // 添加服务器节点
        const serverNames = {};
        servers.forEach((server, index) => {
            // 确保服务器有名称
            const name = server.name || `Server ${index + 1}`;
            serverNames[name] = true;
            
            // 检查节点是否已存在
            if (!data.find(node => node.name === name)) {
                data.push({
                    name: name,
                    value: 15,
                    category: 2,
                    symbolSize: 40,
                    itemStyle: {
                        color: '#fac858'
                    }
                });
                
                // Nginx到服务器的连接
                links.push({
                    source: 'Nginx',
                    target: name,
                    value: 1
                });
            }
        });
        
        // 添加上游服务器节点
        for (const [name, servers] of Object.entries(upstreams)) {
            if (!name || !servers || !Array.isArray(servers)) continue;
            
            const upstreamNodeName = `上游: ${name}`;
            
            // 检查节点是否已存在
            if (!data.find(node => node.name === upstreamNodeName)) {
                data.push({
                    name: upstreamNodeName,
                    value: 15,
                    category: 3,
                    symbolSize: 50,
                    itemStyle: {
                        color: '#ee6666'
                    }
                });
                
                // Nginx到上游服务器的连接
                links.push({
                    source: 'Nginx',
                    target: upstreamNodeName,
                    value: 1
                });
            }
            
            // 添加上游服务器中的服务器节点
            servers.forEach((server, index) => {
                if (!server) return;
                
                const serverName = `${name}-${index + 1}: ${server}`;
                
                // 检查节点是否已存在
                if (!data.find(node => node.name === serverName)) {
                    data.push({
                        name: serverName,
                        value: 10,
                        category: 4,
                        symbolSize: 30,
                        itemStyle: {
                            color: '#73c0de'
                        }
                    });
                    
                    // 上游服务器到具体服务器的连接
                    links.push({
                        source: upstreamNodeName,
                        target: serverName,
                        value: 1
                    });
                }
            });
        }
        
        // 图表配置
        const option = {
            title: {
                text: 'Nginx服务拓扑图',
                top: 'top',
                left: 'center'
            },
            tooltip: {
                trigger: 'item',
                formatter: '{b}'
            },
            legend: {
                data: ['客户端', 'Nginx', '服务器', '上游服务器组', '上游服务器'],
                bottom: 10
            },
            animationDuration: 1500,
            animationEasingUpdate: 'quinticInOut',
            series: [
                {
                    name: 'Nginx拓扑',
                    type: 'graph',
                    layout: 'force',
                    data: data,
                    links: links,
                    categories: [
                        { name: '客户端' },
                        { name: 'Nginx' },
                        { name: '服务器' },
                        { name: '上游服务器组' },
                        { name: '上游服务器' }
                    ],
                    roam: true,
                    label: {
                        show: true,
                        position: 'right'
                    },
                    force: {
                        repulsion: 200,
                        edgeLength: 120
                    },
                    lineStyle: {
                        color: 'source',
                        curveness: 0.3
                    },
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: {
                            width: 5
                        }
                    }
                }
            ]
        };
        
        // 设置图表
        topologyInstance.setOption(option);
    }

    // 创建路由规则图
    function createRoutesChart(routes, upstreams) {
        const data = [];
        const links = [];
        const categories = [
            { name: 'HTTP路径' },
            { name: '代理目标' },
            { name: '上游服务器' }
        ];
        
        // 检查是否有路由数据
        if (routes.length === 0) {
            // 如果没有路由数据，显示空图表
            const option = {
                title: {
                    text: 'Nginx路由规则',
                    top: 'top',
                    left: 'center'
                },
                tooltip: {
                    show: false
                },
                series: []
            };
            
            routesInstance.setOption(option);
            return;
        }
        
        // 添加路由节点
        routes.forEach((route, index) => {
            // 确保节点值有效
            if (!route.from || !route.to) return;
            
            const fromNode = route.from;
            let toNode = route.to;
            
            // 检查目标是否为上游服务器
            let isUpstream = false;
            if (toNode.startsWith('http://') || toNode.startsWith('https://')) {
                const parts = toNode.split('/');
                if (parts.length >= 3) {
                    const upstreamName = parts[2];
                    
                    if (upstreams[upstreamName]) {
                        isUpstream = true;
                        toNode = `上游: ${upstreamName}`;
                    }
                }
            }
            
            // 添加源节点
            if (!data.find(node => node.name === fromNode)) {
                data.push({
                    name: fromNode,
                    category: 0,
                    symbolSize: 40,
                    value: routes.filter(r => r.from === fromNode).length,
                    itemStyle: {
                        color: '#5470c6'
                    }
                });
            }
            
            // 添加目标节点
            if (!data.find(node => node.name === toNode)) {
                data.push({
                    name: toNode,
                    category: isUpstream ? 2 : 1,
                    symbolSize: 40,
                    value: isUpstream ? (upstreams[toNode.replace('上游: ', '')] || []).length : 1,
                    itemStyle: {
                        color: isUpstream ? '#ee6666' : '#91cc75'
                    }
                });
                
                // 如果是上游服务器，添加其子节点
                if (isUpstream) {
                    const upstreamName = toNode.replace('上游: ', '');
                    const servers = upstreams[upstreamName] || [];
                    
                    servers.forEach((server, idx) => {
                        if (!server) return;
                        
                        const serverName = `${upstreamName}-${idx + 1}: ${server}`;
                        
                        // 确保节点名称唯一
                        if (!data.find(node => node.name === serverName)) {
                            data.push({
                                name: serverName,
                                category: 1,
                                symbolSize: 30,
                                value: 1,
                                itemStyle: {
                                    color: '#73c0de'
                                }
                            });
                            
                            // 检查源节点是否存在
                            if (data.find(node => node.name === toNode)) {
                                links.push({
                                    source: toNode,
                                    target: serverName,
                                    lineStyle: {
                                        width: 3,
                                        curveness: 0.2
                                    }
                                });
                            }
                        }
                    });
                }
            }
            
            // 确保两个节点都存在再添加链接
            if (data.find(node => node.name === fromNode) && 
                data.find(node => node.name === toNode)) {
                links.push({
                    source: fromNode,
                    target: toNode,
                    lineStyle: {
                        width: 5,
                        curveness: 0.2
                    }
                });
            }
        });
        
        // 检查是否有有效的数据
        if (data.length === 0) {
            const option = {
                title: {
                    text: 'Nginx路由规则 (无数据)',
                    top: 'top',
                    left: 'center'
                },
                tooltip: {
                    show: false
                },
                series: []
            };
            
            routesInstance.setOption(option);
            return;
        }
        
        // 图表配置
        const option = {
            title: {
                text: 'Nginx路由规则',
                top: 'top',
                left: 'center'
            },
            tooltip: {
                trigger: 'item',
                formatter: '{b}'
            },
            legend: {
                data: categories.map(a => a.name),
                bottom: 10
            },
            animationDuration: 1500,
            animationEasingUpdate: 'quinticInOut',
            series: [
                {
                    name: '路由规则',
                    type: 'graph',
                    layout: 'force',
                    data: data,
                    links: links,
                    categories: categories,
                    roam: true,
                    label: {
                        show: true,
                        position: 'right'
                    },
                    force: {
                        repulsion: 200,
                        edgeLength: 150
                    },
                    lineStyle: {
                        color: 'source',
                        curveness: 0.3
                    },
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: {
                            width: 5
                        }
                    }
                }
            ]
        };
        
        // 设置图表
        routesInstance.setOption(option);
    }

    // 创建服务器配置图
    function createServersChart(servers) {
        // 检查是否有服务器数据
        if (!servers || servers.length === 0) {
            // 如果没有数据，初始化echarts实例并显示空图表
            if (!serversInstance) {
                serversInstance = echarts.init(document.getElementById('serversChart'));
            }
            
            const option = {
                title: {
                    text: 'Nginx服务器配置 (无数据)',
                    top: 'top',
                    left: 'center'
                },
                tooltip: {
                    show: false
                },
                series: []
            };
            
            serversInstance.setOption(option);
            return;
        }
        
        // 改用流程图可视化展示服务器配置
        if (serversInstance) {
            serversInstance.dispose(); // 销毁原有的图表实例
            serversInstance = null;
        }
        
        const serversDiv = document.getElementById('serversChart');
        serversDiv.innerHTML = '';
        
        // 创建服务器选择器
        const serverSelectorContainer = document.createElement('div');
        serverSelectorContainer.className = 'server-selector-container';
        
        const serverLabel = document.createElement('label');
        serverLabel.textContent = '选择服务器: ';
        serverLabel.className = 'server-selector-label';
        
        const serverSelector = document.createElement('select');
        serverSelector.className = 'server-selector';
        
        // 添加所有服务器选项
        servers.forEach((server, index) => {
            if (!server) return;
            
            const option = document.createElement('option');
            option.value = index;
            
            // 获取服务器名称
            const serverName = server.name || `未命名服务器 ${index + 1}`;
            
            // 添加端口信息
            let portInfo = '';
            if (server.listen && server.listen.length > 0) {
                portInfo = ` (${server.listen.join(', ')})`;
            }
            
            option.textContent = serverName + portInfo;
            serverSelector.appendChild(option);
        });
        
        // 创建可视化容器
        const visualizationContainer = document.createElement('div');
        visualizationContainer.className = 'proxy-visualization-container';
        
        // 创建编辑切换按钮
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'view-toggle-container';
        
        const viewToggle = document.createElement('button');
        viewToggle.textContent = '切换到表格视图';
        viewToggle.className = 'view-toggle-btn';
        
        let currentView = 'visual'; // 'visual' 或 'table'
        
        // 函数：创建服务器配置的流程图可视化
        function createServerVisual(serverIndex) {
            const server = servers[serverIndex];
            if (!server) return;
            
            visualizationContainer.innerHTML = '';
            
            // 创建流程图容器
            const flowContainer = document.createElement('div');
            flowContainer.className = 'flow-container';
            
            // 创建服务器信息头部
            const serverInfo = document.createElement('div');
            serverInfo.className = 'server-info';
            
            const serverName = document.createElement('h3');
            serverName.textContent = server.name || `未命名服务器 ${Number(serverIndex) + 1}`;
            serverName.className = 'server-info-name';
            
            const listenInfo = document.createElement('div');
            listenInfo.className = 'listen-info';
            
            if (server.listen && server.listen.length > 0) {
                server.listen.forEach(listen => {
                    const listenBadge = document.createElement('span');
                    listenBadge.className = 'listen-badge';
                    listenBadge.textContent = listen;
                    listenInfo.appendChild(listenBadge);
                });
            }
            
            serverInfo.appendChild(serverName);
            serverInfo.appendChild(listenInfo);
            flowContainer.appendChild(serverInfo);
            
            // 创建路径映射可视化
            if (server.locations && server.locations.length > 0) {
                const flowTitle = document.createElement('h4');
                flowTitle.textContent = '代理规则流程图';
                flowTitle.className = 'flow-title';
                flowContainer.appendChild(flowTitle);
                
                // 创建代理规则流程图
                const proxyFlow = document.createElement('div');
                proxyFlow.className = 'proxy-flow';
                
                // 按照路径长度排序，确保从具体到一般
                const sortedLocations = [...server.locations].sort((a, b) => {
                    // 先排除没有代理的路径
                    if (!a.proxyPass && b.proxyPass) return 1;
                    if (a.proxyPass && !b.proxyPass) return -1;
                    if (!a.proxyPass && !b.proxyPass) return 0;
                    
                    // 然后按路径长度排序，具体的路径优先
                    const aPath = a.path || '/';
                    const bPath = b.path || '/';
                    return bPath.length - aPath.length;
                });
                
                sortedLocations.forEach(location => {
                    if (!location) return;
                    
                    const pathBlock = document.createElement('div');
                    pathBlock.className = 'path-block';
                    
                    // 入口（路径）
                    const pathEntry = document.createElement('div');
                    pathEntry.className = 'path-entry';
                    pathEntry.title = '请求路径';
                    
                    const pathIcon = document.createElement('div');
                    pathIcon.className = 'path-icon';
                    pathIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
                    
                    const pathLabel = document.createElement('div');
                    pathLabel.className = 'path-label';
                    pathLabel.textContent = location.path || '/';
                    
                    pathEntry.appendChild(pathIcon);
                    pathEntry.appendChild(pathLabel);
                    
                    // 箭头
                    const pathArrow = document.createElement('div');
                    pathArrow.className = 'path-arrow';
                    pathArrow.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16.01 11H4v2h12.01v3L20 12l-3.99-4z"/></svg>';
                    
                    // 目标（代理或根目录）
                    const pathTarget = document.createElement('div');
                    pathTarget.className = 'path-target';
                    
                    // 代理目标
                    if (location.proxyPass) {
                        pathTarget.title = '代理目标';
                        pathTarget.classList.add('proxy-target');
                        
                        const targetIcon = document.createElement('div');
                        targetIcon.className = 'target-icon';
                        targetIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
                        
                        const targetLabel = document.createElement('div');
                        targetLabel.className = 'target-label';
                        targetLabel.textContent = location.proxyPass;
                        
                        pathTarget.appendChild(targetIcon);
                        pathTarget.appendChild(targetLabel);
                    } 
                    // 根目录
                    else if (location.root) {
                        pathTarget.title = '根目录';
                        pathTarget.classList.add('root-target');
                        
                        const targetIcon = document.createElement('div');
                        targetIcon.className = 'target-icon';
                        targetIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
                        
                        const targetLabel = document.createElement('div');
                        targetLabel.className = 'target-label';
                        targetLabel.textContent = location.root;
                        
                        pathTarget.appendChild(targetIcon);
                        pathTarget.appendChild(targetLabel);
                    }
                    // 无目标
                    else {
                        pathTarget.title = '无目标';
                        pathTarget.classList.add('no-target');
                        
                        const targetIcon = document.createElement('div');
                        targetIcon.className = 'target-icon';
                        targetIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>';
                        
                        const targetLabel = document.createElement('div');
                        targetLabel.className = 'target-label';
                        targetLabel.textContent = "未配置目标";
                        
                        pathTarget.appendChild(targetIcon);
                        pathTarget.appendChild(targetLabel);
                    }
                    
                    // 组装流程块
                    pathBlock.appendChild(pathEntry);
                    pathBlock.appendChild(pathArrow);
                    pathBlock.appendChild(pathTarget);
                    
                    proxyFlow.appendChild(pathBlock);
                });
                
                flowContainer.appendChild(proxyFlow);
            } else {
                // 没有位置规则
                const noLocations = document.createElement('div');
                noLocations.className = 'no-locations';
                noLocations.textContent = '该服务器没有配置位置规则';
                flowContainer.appendChild(noLocations);
            }
            
            visualizationContainer.appendChild(flowContainer);
        }
        
        // 函数：创建服务器配置的表格视图
        function createServerTable(serverIndex) {
            const server = servers[serverIndex];
            if (!server) return;
            
            visualizationContainer.innerHTML = '';
            
            // 创建表格容器
            const tableContainer = document.createElement('div');
            tableContainer.className = 'server-table-container';
            
            // 创建服务器信息头部
            const serverInfo = document.createElement('div');
            serverInfo.className = 'server-info';
            
            const serverName = document.createElement('h3');
            serverName.textContent = server.name || `未命名服务器 ${Number(serverIndex) + 1}`;
            serverInfo.appendChild(serverName);
            
            if (server.listen && server.listen.length > 0) {
                const listenSection = document.createElement('div');
                listenSection.className = 'config-section';
                
                const listenTitle = document.createElement('h4');
                listenTitle.textContent = '监听端口';
                listenSection.appendChild(listenTitle);
                
                const listenTable = document.createElement('table');
                listenTable.className = 'config-table';
                
                // 表头
                const tableHead = document.createElement('thead');
                const headRow = document.createElement('tr');
                const headCell = document.createElement('th');
                headCell.textContent = '端口/地址';
                headRow.appendChild(headCell);
                tableHead.appendChild(headRow);
                listenTable.appendChild(tableHead);
                
                // 表内容
                const tableBody = document.createElement('tbody');
                server.listen.forEach(listen => {
                    if (!listen) return;
                    
                    const row = document.createElement('tr');
                    const cell = document.createElement('td');
                    cell.textContent = listen;
                    row.appendChild(cell);
                    tableBody.appendChild(row);
                });
                
                listenTable.appendChild(tableBody);
                listenSection.appendChild(listenTable);
                tableContainer.appendChild(listenSection);
            }
            
            // 位置规则表格
            if (server.locations && server.locations.length > 0) {
                const locationsSection = document.createElement('div');
                locationsSection.className = 'config-section';
                
                const locationsTitle = document.createElement('h4');
                locationsTitle.textContent = '位置规则';
                locationsSection.appendChild(locationsTitle);
                
                const locationsTable = document.createElement('table');
                locationsTable.className = 'config-table';
                
                // 表头
                const tableHead = document.createElement('thead');
                const headRow = document.createElement('tr');
                ['路径', '代理目标', '根目录'].forEach(title => {
                    const headCell = document.createElement('th');
                    headCell.textContent = title;
                    headRow.appendChild(headCell);
                });
                tableHead.appendChild(headRow);
                locationsTable.appendChild(tableHead);
                
                // 表内容
                const tableBody = document.createElement('tbody');
                server.locations.forEach(location => {
                    if (!location) return;
                    
                    const row = document.createElement('tr');
                    
                    // 路径
                    const pathCell = document.createElement('td');
                    pathCell.textContent = location.path || '/';
                    row.appendChild(pathCell);
                    
                    // 代理目标
                    const proxyCell = document.createElement('td');
                    proxyCell.textContent = location.proxyPass || '-';
                    row.appendChild(proxyCell);
                    
                    // 根目录
                    const rootCell = document.createElement('td');
                    rootCell.textContent = location.root || '-';
                    row.appendChild(rootCell);
                    
                    tableBody.appendChild(row);
                });
                
                locationsTable.appendChild(tableBody);
                locationsSection.appendChild(locationsTable);
                tableContainer.appendChild(locationsSection);
            }
            
            visualizationContainer.appendChild(tableContainer);
        }
        
        // 切换视图按钮点击事件
        viewToggle.addEventListener('click', function() {
            if (currentView === 'visual') {
                currentView = 'table';
                viewToggle.textContent = '切换到可视化视图';
                createServerTable(serverSelector.value);
            } else {
                currentView = 'visual';
                viewToggle.textContent = '切换到表格视图';
                createServerVisual(serverSelector.value);
            }
        });
        
        // 服务器选择事件
        serverSelector.addEventListener('change', function() {
            if (currentView === 'visual') {
                createServerVisual(this.value);
            } else {
                createServerTable(this.value);
            }
        });
        
        // 组装UI
        serverSelectorContainer.appendChild(serverLabel);
        serverSelectorContainer.appendChild(serverSelector);
        toggleContainer.appendChild(viewToggle);
        
        serversDiv.appendChild(serverSelectorContainer);
        serversDiv.appendChild(toggleContainer);
        serversDiv.appendChild(visualizationContainer);
        
        // 初始化显示第一个服务器
        if (servers.length > 0) {
            createServerVisual(0);
        }
    }

    // 显示配置树形结构
    function displayConfigTree(config) {
        configTree.innerHTML = '';
        renderConfigNode(config, configTree);
    }

    // 渲染配置节点
    function renderConfigNode(node, parentElement) {
        if (node.type === 'root') {
            node.children.forEach(child => {
                renderConfigNode(child, parentElement);
            });
        }
        else if (node.type === 'block') {
            const itemElement = document.createElement('div');
            itemElement.className = 'tree-item';
            
            const directiveElement = document.createElement('div');
            directiveElement.className = 'directive';
            directiveElement.textContent = node.directive;
            
            if (node.params.length > 0) {
                const valueElement = document.createElement('span');
                valueElement.className = 'value';
                valueElement.textContent = node.params.join(' ');
                directiveElement.appendChild(valueElement);
            }
            
            // 点击事件，展开/折叠和显示详情
            directiveElement.addEventListener('click', function() {
                // 切换展开/折叠状态
                this.classList.toggle('open');
                
                // 展示或隐藏子元素
                const blockElement = this.nextElementSibling;
                if (blockElement && blockElement.classList.contains('tree-block')) {
                    blockElement.style.display = blockElement.style.display === 'none' ? 'block' : 'none';
                }
                
                // 显示详情
                displayDetails(node);
            });
            
            itemElement.appendChild(directiveElement);
            
            // 创建子元素的容器
            if (node.children.length > 0) {
                const blockElement = document.createElement('div');
                blockElement.className = 'tree-block';
                blockElement.style.display = 'none'; // 默认折叠
                
                // 递归渲染子元素
                node.children.forEach(child => {
                    renderConfigNode(child, blockElement);
                });
                
                itemElement.appendChild(blockElement);
            }
            
            parentElement.appendChild(itemElement);
        }
        else if (node.type === 'directive') {
            const itemElement = document.createElement('div');
            itemElement.className = 'tree-item';
            
            const directiveElement = document.createElement('div');
            directiveElement.className = 'directive';
            directiveElement.style.fontWeight = 'normal'; // 普通指令不加粗
            directiveElement.textContent = node.directive;
            
            if (node.params.length > 0) {
                const valueElement = document.createElement('span');
                valueElement.className = 'value';
                valueElement.textContent = node.params.join(' ');
                directiveElement.appendChild(valueElement);
            }
            
            // 点击事件显示详情
            directiveElement.addEventListener('click', function() {
                displayDetails(node);
            });
            
            itemElement.appendChild(directiveElement);
            parentElement.appendChild(itemElement);
        }
    }

    // 显示指令详情信息
    function displayDetails(node) {
        configDetails.innerHTML = '';
        
        const titleElement = document.createElement('h3');
        titleElement.textContent = node.directive;
        configDetails.appendChild(titleElement);
        
        if (node.params.length > 0) {
            const paramsElement = document.createElement('p');
            paramsElement.innerHTML = '<strong>参数：</strong> ' + node.params.join(' ');
            configDetails.appendChild(paramsElement);
        }
        
        // 添加指令的说明和用法
        const descriptionElement = document.createElement('div');
        descriptionElement.className = 'directive-info';
        
        // 根据不同指令添加不同的描述
        let description = '';
        switch(node.directive) {
            case 'server':
                description = '定义一个服务器。在HTTP环境中，它声明了一个新的虚拟服务器。';
                break;
            case 'location':
                description = '根据请求URI设置配置。';
                break;
            case 'http':
                description = '提供HTTP服务器指令的主要上下文。';
                break;
            case 'upstream':
                description = '定义一组服务器，可以在proxy_pass、fastcgi_pass等指令中引用。';
                break;
            case 'events':
                description = '提供配置连接处理的指令。';
                break;
            case 'listen':
                description = '设置服务器接受请求的地址和端口。';
                break;
            case 'root':
                description = '设置请求的根目录。';
                break;
            case 'proxy_pass':
                description = '设置代理服务器的协议和地址。';
                break;
            case 'fastcgi_pass':
                description = '设置FastCGI服务器的地址。';
                break;
            case 'worker_processes':
                description = '定义worker进程的数量。';
                break;
            case 'include':
                description = '包含其他配置文件。';
                break;
            default:
                description = `${node.directive} 指令的详细信息。`;
        }
        
        descriptionElement.innerHTML = '<strong>描述：</strong><p>' + description + '</p>';
        configDetails.appendChild(descriptionElement);
        
        // 如果是块指令，显示子指令数量
        if (node.type === 'block' && node.children.length > 0) {
            const childrenElement = document.createElement('p');
            childrenElement.innerHTML = '<strong>包含 ' + node.children.length + ' 个子指令</strong>';
            configDetails.appendChild(childrenElement);
        }
    }

    // 窗口大小调整时重绘图表
    window.addEventListener('resize', () => {
        topologyInstance.resize();
        routesInstance.resize();
        if (serversInstance) {
            serversInstance.resize();
        }
    });
}); 
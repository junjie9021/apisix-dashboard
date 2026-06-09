/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Col, Form, InputNumber, Row } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'umi';

import { fetchUpstreamNodes } from '@/pages/Upstream/service';

import { removeBtnStyle } from '..';

type Props = {
  readonly?: boolean;
};

// 从后端API获取主机数据
const fetchRemoteHosts = async (
  searchText?: string,
): Promise<{ label: string; value: string }[]> => {
  try {
    // 调用后端API获取数据
    const nodes = await fetchUpstreamNodes();

    // 转换为前端需要的格式
    const hostData = nodes.map((node) => ({
      label: `${node.hostname}(${node.ip})`,
      value: node.ip,
    }));

    // 如果没有搜索文本，返回所有数据
    if (!searchText) {
      return hostData;
    }

    // 过滤匹配搜索文本的数据
    const filtered = hostData.filter(
      (item) =>
        item.value.toLowerCase().includes(searchText.toLowerCase()) ||
        item.label.toLowerCase().includes(searchText.toLowerCase()),
    );

    return filtered;
  } catch (error) {
    console.error('Failed to fetch upstream nodes:', error);
    // 发生错误时返回空数组
    return [];
  }
};

const Component: React.FC<Props> = ({ readonly }) => {
  const { formatMessage } = useIntl();
  const [hostOptions, setHostOptions] = useState<{ label: string; value: string }[]>([]);
  const [allOptions, setAllOptions] = useState<{ label: string; value: string }[]>([]);

  // 初始化时加载所有数据
  const loadAllOptions = useCallback(async () => {
    try {
      // 获取所有可用的主机选项
      const options = await fetchRemoteHosts(''); // 传空字符串获取所有数据
      setAllOptions(options);
      return options;
    } catch (error) {
      console.error('Failed to fetch all hosts:', error);
      return [];
    }
  }, []);

  // 远程搜索函数
  const handleSearch = useCallback(
    async (searchText: string) => {
      let options = allOptions;

      // 如果还没有加载所有选项，先加载
      if (allOptions.length === 0) {
        options = await loadAllOptions();
      }

      if (!searchText) {
        // 没有搜索文本时显示所有选项
        setHostOptions(options);
        return;
      }

      // 过滤匹配搜索文本的选项
      const filtered = options.filter(
        (item) =>
          item.value.toLowerCase().includes(searchText.toLowerCase()) ||
          item.label.toLowerCase().includes(searchText.toLowerCase()),
      );

      setHostOptions(filtered);
    },
    [allOptions, loadAllOptions],
  );

  // 处理点击下拉框
  const handleDropdownVisibleChange = useCallback(
    async (open: boolean) => {
      if (open && hostOptions.length === 0) {
        // 下拉框打开时，如果没有选项则加载所有选项
        const options = allOptions.length > 0 ? allOptions : await loadAllOptions();
        setHostOptions(options);
      }
    },
    [hostOptions.length, allOptions, loadAllOptions],
  );

  // 处理选择或输入
  const handleHostChange = (value: string, fieldName: number) => {
    // 如果输入的值不在选项中，也允许使用（支持手动输入）
    console.log(`Selected/Input host for field ${fieldName}:`, value);
  };

  // 组件挂载时初始化数据
  useEffect(() => {
    loadAllOptions();
  }, [loadAllOptions]);

  return (
    <Form.List
      name="submitNodes"
      initialValue={[{ host: undefined, port: undefined, weight: undefined }]}
    >
      {(fields, { add, remove }) => (
        <>
          <Form.Item
            label={formatMessage({ id: 'page.upstream.form.item-label.node.domain.or.ip' })}
            style={{ marginBottom: 0 }}
          >
            {fields.map((field, index) => (
              <Row style={{ marginBottom: 10 }} gutter={16} key={index}>
                <Col xs={9} sm={12} md={9} lg={10} xl={7} xxl={6}>
                  <Form.Item
                    label={formatMessage({ id: 'page.upstream.step.host' })}
                    style={{ marginBottom: 0 }}
                    name={[field.name, 'host']}
                    rules={[
                      {
                        required: true,
                        message: formatMessage({
                          id: 'page.upstream.step.input.domain.name.or.ip',
                        }),
                      },
                      {
                        // eslint-disable-next-line no-useless-escape
                        pattern: new RegExp(/^\*?[0-9a-zA-Z-._\[\]:]+$/),
                        message: formatMessage({
                          id: 'page.route.form.itemRulesPatternMessage.domain',
                        }),
                      },
                    ]}
                  >
                    <AutoComplete
                      placeholder={formatMessage({ id: 'page.upstream.step.domain.name.or.ip' })}
                      disabled={readonly}
                      onSearch={handleSearch}
                      onChange={(value: string) => handleHostChange(value, field.name)}
                      onDropdownVisibleChange={handleDropdownVisibleChange}
                      options={hostOptions}
                      allowClear
                      showSearch
                      filterOption={false}
                      defaultActiveFirstOption={false}
                    />
                  </Form.Item>
                </Col>
                <Col md={5} lg={5} xl={5} xxl={4}>
                  <Form.Item
                    style={{ marginBottom: 0 }}
                    name={[field.name, 'port']}
                    label={formatMessage({ id: 'page.upstream.step.port' })}
                  >
                    <InputNumber
                      placeholder={formatMessage({ id: 'page.upstream.step.port' })}
                      disabled={readonly}
                      min={1}
                      max={65535}
                    />
                  </Form.Item>
                </Col>
                <Col md={5} lg={5} xl={5} xxl={4}>
                  <Form.Item
                    style={{ marginBottom: 0 }}
                    name={[field.name, 'weight']}
                    label={formatMessage({ id: 'page.upstream.step.weight' })}
                    rules={[
                      {
                        required: true,
                        message: formatMessage({ id: 'page.upstream.step.input.weight' }),
                      },
                    ]}
                    initialValue={1}
                  >
                    <InputNumber
                      placeholder={formatMessage({ id: 'page.upstream.step.weight' })}
                      disabled={readonly}
                      min={0}
                      max={1000}
                    />
                  </Form.Item>
                </Col>
                <Col style={{ ...removeBtnStyle }}>
                  {!readonly && (
                    <MinusCircleOutlined
                      data-cy={`upstream-node-minus-${index}`}
                      onClick={() => remove(field.name)}
                    />
                  )}
                </Col>
              </Row>
            ))}
          </Form.Item>
          {!readonly && (
            <Form.Item wrapperCol={{ offset: 3 }}>
              <Button type="dashed" onClick={add} data-cy="add-node">
                <PlusOutlined />
                {formatMessage({ id: 'component.global.add' })}
              </Button>
            </Form.Item>
          )}
        </>
      )}
    </Form.List>
  );
};

export default Component;

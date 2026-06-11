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
import { Button, Drawer, Form, Input, notification, Select, Space, Spin, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { useIntl } from 'umi';

import { broadcast } from '../service';

const { Option } = Select;
const { Text } = Typography;
const RESULT_PREVIEW_BYTES = 500;
const DEFAULT_DATA = '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}';
const DEFAULT_HEADERS = '{"Content-Type":"application/json"}';

type Props = {
  id: string;
  visible: boolean;
  onClose: () => void;
};

const sliceByBytes = (text: string, bytes: number) => {
  if (typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined') {
    return text.length > bytes ? text.slice(0, bytes) : text;
  }

  const encoded = new TextEncoder().encode(text);
  if (encoded.length <= bytes) {
    return text;
  }
  return new TextDecoder().decode(encoded.slice(0, bytes));
};

const normalizePath = (path?: string) => {
  if (!path) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
};

const parseHeaders = (headers?: string) => {
  if (!headers) {
    return {};
  }

  try {
    return JSON.parse(headers);
  } catch (error) {
    notification.error({ message: 'headers 必须是合法 JSON' });
    throw error;
  }
};

const CurlDrawer: React.FC<Props> = ({ id, visible, onClose }) => {
  const { formatMessage } = useIntl();
  const [form] = Form.useForm<UpstreamModule.BroadcastRequest>();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UpstreamModule.BroadcastResponse[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible) {
      form.setFieldsValue({
        id,
        path: '/',
        headers: DEFAULT_HEADERS,
        method: 'POST',
        data: DEFAULT_DATA,
      });
      setResults([]);
      setExpandedKeys({});
    }
  }, [form, id, visible]);

  const copyText = useMemo(() => JSON.stringify(results, null, 2), [results]);

  const handleExecute = () => {
    form.validateFields().then((values) => {
      let headers: Record<string, string>;
      try {
        headers = parseHeaders(values.headers);
      } catch (error) {
        return;
      }

      setLoading(true);
      setExpandedKeys({});
      broadcast({
        ...values,
        id,
        path: normalizePath(values.path),
        headers,
      })
        .then((data) => {
          setResults(data || []);
        })
        .finally(() => {
          setLoading(false);
        });
    });
  };

  return (
    <Drawer
      title="Curl"
      placement="right"
      width={700}
      visible={visible}
      onClose={onClose}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="path" label="path" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="headers" label="headers" rules={[{ required: true }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Form.Item name="method" label="method" rules={[{ required: true }]}>
          <Select>
            <Option value="GET">GET</Option>
            <Option value="POST">POST</Option>
          </Select>
        </Form.Item>
        <Form.Item name="data" label="data">
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
        </Form.Item>
        <Space>
          <Button type="primary" loading={loading} onClick={handleExecute}>
            执行
          </Button>
          <CopyToClipboard
            text={copyText}
            onCopy={(_: string, result: boolean) => {
              if (!result) {
                notification.error({
                  message: formatMessage({ id: 'component.global.copyFail' }),
                });
                return;
              }
              notification.success({
                message: formatMessage({ id: 'component.global.copySuccess' }),
              });
            }}
          >
            <Button disabled={!results.length}>{formatMessage({ id: 'component.global.copy' })}</Button>
          </CopyToClipboard>
        </Space>
      </Form>
      <Spin spinning={loading}>
        <div style={{ marginTop: 24 }}>
          {results.map((item) => {
            const nodeKey = `${item.Hostname || '-'}-${item.Host || '-'}`;
            const result = item.Result || '';
            const preview = sliceByBytes(result, RESULT_PREVIEW_BYTES);
            const truncated = preview !== result;
            const expanded = expandedKeys[nodeKey];

            return (
              <div
                key={nodeKey}
                style={{
                  borderBottom: '1px solid #f0f0f0',
                  padding: '12px 0',
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>
                    {item.Hostname || '-'} {item.Host ? `(${item.Host})` : ''}
                  </Text>
                  <Text type={item.Ok ? 'success' : 'danger'}>
                    {item.Ok ? 'OK' : 'Failed'}
                  </Text>
                  <pre
                    style={{
                      background: '#fafafa',
                      margin: 0,
                      maxHeight: expanded ? 480 : 160,
                      overflow: 'auto',
                      padding: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {expanded || !truncated ? result : preview}
                  </pre>
                  {truncated && !expanded && (
                    <Button
                      type="link"
                      style={{ padding: 0, width: 'fit-content' }}
                      onClick={() => {
                        setExpandedKeys((current) => ({ ...current, [nodeKey]: true }));
                      }}
                    >
                      显示全部
                    </Button>
                  )}
                </Space>
              </div>
            );
          })}
        </div>
      </Spin>
    </Drawer>
  );
};

export default CurlDrawer;

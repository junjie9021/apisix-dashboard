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
package tool

import (
    "fmt"
    "io"
    "net/http"
    "reflect"
    "strings"
    "sync"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/shiningrush/droplet"
    "github.com/shiningrush/droplet/data"
    "github.com/shiningrush/droplet/wrapper"
    wgin "github.com/shiningrush/droplet/wrapper/gin"

    "github.com/apisix/manager-api/internal/handler"
    "github.com/apisix/manager-api/internal/utils"
	"github.com/apisix/manager-api/internal/core/entity"
	"github.com/apisix/manager-api/internal/core/store"
)

var (
    hostErr = fmt.Errorf("lack host")
    methodErr = fmt.Errorf("unknown method")
    convErr = fmt.Errorf("convert upstream fail")

    transport = &http.Transport{
            MaxIdleConns:        100,              // Maximum idle connections
            MaxIdleConnsPerHost: 10,               // Maximum idle connections per host
            IdleConnTimeout:     90 * time.Second, // Idle connection timeout
            DisableCompression:  false,            // Enable compression
            DisableKeepAlives:   false,            // Enable keep-alives
        }

    client = http.Client{
                Transport: transport,
                Timeout:   30 * time.Second,
        }
)

type Handler struct {
    upstreamStore    store.Interface
}

type InfoOutput struct {
    Hash    string `json:"commit_hash"`
    Version string `json:"version"`
}

func NewHandler() (handler.RouteRegister, error) {
    return &Handler{
        upstreamStore:    store.GetStore(store.HubKeyUpstream),
    }, nil
}

func (h *Handler) ApplyRoute(r *gin.Engine) {
    r.GET("/apisix/admin/tool/version", wgin.Wraps(h.Version))
    r.POST("/apisix/admin/tool/node", wgin.Wraps(h.Request,
            wrapper.InputType(reflect.TypeOf(RequestInput{}))))
    r.Any("/apisix/admin/tool/broadcast", wgin.Wraps(h.Broadcast,
            wrapper.InputType(reflect.TypeOf(BroadcastInput{}))))
}

func (h *Handler) Version(_ droplet.Context) (interface{}, error) {
    hash, version := utils.GetHashAndVersion()
    return &InfoOutput{
        Hash:    hash,
        Version: version,
    }, nil
}

type RequestInput struct {
    Host string `validate:"required"`
    Method string `validate:"required"`
    Data string
    Path string
}

type BroadcastInput struct {
    ID string `validate:"required"`
    Method string `validate:"required"`
    Data string
    Path string
    Headers map[string]string
}

type Resp struct {
    Hostname string
    Host string
    Result string
    Ok bool
}

func (h *Handler) Request(c droplet.Context) (interface{}, error) {
    input := c.Input().(*RequestInput)
    if input.Host == "" {
        return &data.SpecCodeResponse{StatusCode: http.StatusBadRequest}, hostErr
    }

    method := strings.ToUpper(input.Method)
    if method != http.MethodGet &&  method != http.MethodPost && method != http.MethodPatch && method != http.MethodPut && method != http.MethodDelete {
        return &data.SpecCodeResponse{StatusCode: http.StatusBadRequest}, methodErr
    }

    req, err := http.NewRequest(method, "http://" + input.Host + input.Path, strings.NewReader(input.Data))
        if err != nil {
            return &data.SpecCodeResponse{StatusCode: http.StatusInternalServerError}, err
        }

    req.Header.Add("content-type", `application/json`)
    resp, err := client.Do(req)
        if err != nil {
            return &data.SpecCodeResponse{StatusCode: http.StatusInternalServerError}, err
        }

    return &data.RawResponse{StatusCode: resp.StatusCode,
                             BodyReader: resp.Body,
                 Header: resp.Header}, nil

}

func (h *Handler) Broadcast(c droplet.Context) (interface{}, error) {
    input := c.Input().(*BroadcastInput)

    method := strings.ToUpper(input.Method)
    if method != http.MethodGet &&  method != http.MethodPost && method != http.MethodPatch && method != http.MethodPut && method != http.MethodDelete {
        return &data.SpecCodeResponse{StatusCode: http.StatusBadRequest}, methodErr
    }

    r, err := h.upstreamStore.Get(c.Context(), input.ID)
    if err != nil {
        return &data.SpecCodeResponse{StatusCode: http.StatusInternalServerError}, err
    }
    upstream := r.(*entity.Upstream)
    nodes, ok := entity.NodesFormat(upstream.Nodes).([]*entity.Node)
    if !ok {
        return &data.SpecCodeResponse{StatusCode: http.StatusInternalServerError}, convErr
    }

    result := make([]Resp, 0)
    wg := sync.WaitGroup{} 
    var mu    sync.Mutex
    for _, n := range nodes {
        wg.Add(1)    
        go func() {
            defer wg.Done()
            req, err := http.NewRequest(method, 
                                        fmt.Sprintf("http://%s:%d%s", n.Host, n.Port, input.Path),
                                        strings.NewReader(input.Data))
            if err != nil {
                mu.Lock()
                defer mu.Unlock()
                result = append(result, Resp{Hostname: n.Hostname, Host: n.Host, Result: err.Error(), Ok: false})
                return
            }

            req.Header.Add("content-type", `application/json`)
            auth := c.Request().Header.Get("Authorization")
            if auth != "" {
                req.Header.Add("Authorization", auth)
            }
            for k, v := range input.Headers {
                req.Header.Add(k, v)
            }
            resp, err := client.Do(req)
            if err != nil {
                mu.Lock()
                defer mu.Unlock()
                result = append(result, Resp{Hostname: n.Hostname, Host: n.Host, Result: err.Error(), Ok: false})
                return
            }
            defer resp.Body.Close()

            body, err := io.ReadAll(resp.Body)
            if err != nil {
                mu.Lock()
                defer mu.Unlock()
                result = append(result, Resp{Hostname: n.Hostname, Host: n.Host, Result: err.Error(), Ok: false})
                return
            }

            mu.Lock()
            defer mu.Unlock()
            result = append(result, Resp{Hostname: n.Hostname, Host: n.Host, Result: string(body), Ok: true})
        }()
    }
    wg.Wait()
    return result, nil
}

package main

import (
    "fmt"
    "log"
    "time"
    "connect/db"
    "net/http"
    "github.com/joho/godotenv"
)

//Load service
func load() func(){
    messages := []string{"Obfuscating", "Nerding", "Connecting"}
    started := time.Now()
    stop := make(chan struct{})
    done := make(chan struct{})

    fmt.Printf("\r%-32s", messages[0])

    go func(){
        ticker := time.NewTicker(500 * time.Millisecond)
        defer ticker.Stop()
        defer close(done)

        i := 1
        for {
            select {
            case <-ticker.C:
                fmt.Printf("\r%-32s", messages[i])
                i = (i + 1) % len(messages)
            case <-stop:
                fmt.Printf("\r%32s\r", "")
                return
            }
        }
    }()

    return func(){
        time.Sleep(time.Until(started.Add(1500 * time.Millisecond)))
        close(stop)
        <-done
    }
}


//Main backend service file
func main(){
    stopLoad := load()

 if err := godotenv.Load(".env"); err != nil {
  stopLoad()
  log.Fatalf("Failed to load .env: %v", err)
 }
 db.Connect()

 rows, err := db.DB.Query(`SELECT * FROM forge."User_table"`)
 stopLoad()
 if err != nil {
  log.Fatalf("Query error: %v", err)
 }
 defer rows.Close()

 fmt.Println("Db connected")

 for rows.Next(){
    var accountID int64
    var username, screenName string

    if err := rows.Scan(&accountID, &username, &screenName); err != nil {
        log.Fatalf("Scan failed: %v", err)
    }
    fmt.Println(accountID, username, screenName)
 }
 if err := rows.Err(); err != nil {
    log.Fatalf("Reading rows failed: %v", err)
 }
}


//Checks auth

//Sync service
func sync(){

}

//Lib 

//BG worker


/*
CA Part-01

Student Name: Fabio A. Steyer
Student ID: 22132848
Programme: Higher Diploma in Science in Computing Information (Software Development)
Year of Study: 2024
Module Title: Distributed System
Lecturer:Sudarshan Deshmukh
Project/Issay Title: Smart Agriculture/farming 
Submission Deadline: Monday, 24 April 2024, 11:59 PM
*/


// Import required modules
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fs = require('fs');
const { performance } = require('perf_hooks');

// Path to gRPC .proto file
const PROTO_PATH = '../protos/farming.proto';
// Load and compile the .proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

// Load the package definition into gRPC
const farmingProto = grpc.loadPackageDefinition(packageDefinition).farming;

const server = new grpc.Server();

// Function to calculate the amount of fertilizer needed
function calculateFertilizerRequirement(call, callback) {
    const acres = call.request.acres; // Assume the request has an 'acres' field
    const uptakePerHectarePerDayKgN = 2.5; // Uptake rate in kgN/ha/day
    const days = 90; // Number of days
    const hectaresPerAcre = 0.404686; // 1 acre is approximately 0.404686 hectares
  
    // Convert acres to hectares
    const hectares = acres * hectaresPerAcre;

    // Calculate total Nitrogen needed (hectares * uptake rate * number of days)
  const totalNitrogenNeededKgN = hectares * uptakePerHectarePerDayKgN * days;
  
    // Prepare a response with the calculated total nitrogen needed
    const response = {
        total_nitrogen_needed_kg: totalNitrogenNeededKgN
      };
    
      // Send the response back to the client via the callback function
      callback(null, response);
    }

    // Function to stream temperature data back to a client
    function temperatureDataStream(call) {
      // Extract the sensor ID from the client's request
      const sensorId = call.request.sensor_id;
      let temperature = 20;  // Starting temperature
      let count = 0;  // Initialize a counter to track the number of readings sent
    
      // Set up a timer to send temperature data at regular intervals
      const intervalId = setInterval(() => {
        // Check if the count has reached the maximum number of readings
        if (count >= 10) {  // Only send 10 readings
          // If 10 readings have been sent, clear the interval to stop sending data
          clearInterval(intervalId);
           // Close the stream from the server side
          call.end();
          return;
        }
    
        // If not yet done, increment the temperature and count to simulate data change.
        temperature += (Math.random() * 4 - 2);  // Random temperature fluctuation

        // Send the current state of the temperature reading to the client
        call.write({
          sensor_id: sensorId,
          temperature: temperature,
          timestamp: new Date().toISOString(), // Provide the current time as the timestamp
        });
    
        count++; // Increment the count after sending a reading
      }, 1000); // Send a reading every second
    
      call.on('cancelled', () => {
        clearInterval(intervalId);  // Clear the interval if the client cancels the stream
      });
    }
    
  // Function to compute the average soil moisture from a stream of soil moisture readings 
  function computeAverageSoilMoisture(call, callback) {
    let totalPercentage = 0; // Sum of all calculated soil moisture percentages
    let count = 0; // Number of valid readings received
  
    // Handle each piece of data received from the client
    call.on('data', function(request) {
      // Extract wet and dry soil weights from the request
      const { wet_soil_weight, dry_soil_weight } = request;
      // Check if the dry soil weight is zero to prevent division by zero
      if (dry_soil_weight === 0) {
        console.error('Dry soil weight cannot be zero.'); // Log an error message
        return; // Exit the current data handling to avoid erroneous computation
      }
      // Calculate moisture content percentage using the formula provided:
      // Soil Moisture Percentage (%) = [(Wet Soil Weight – Dry Soil Weight) / Dry Soil Weight] × 100
      const moisturePercentage = ((wet_soil_weight - dry_soil_weight) / dry_soil_weight) * 100;
      // Add the calculated moisture percentage to the total percentage
      totalPercentage += moisturePercentage;
      // Increment the count of valid readings
      count++;
    });
  
    // Handle the 'end' event when no more data is coming
    call.on('end', function() {
      // Calculate the average percentage
      const averagePercentage = count > 0 ? totalPercentage / count : 0;
      // Send the calculated average back to the client via callback
      callback(null, { soil_moisture_percentage: averagePercentage });
    });
  }
  
  // Function to handle bidirectional streaming for calculating optimal watering levels.
  function findOptimum(call) {
    // Listen for 'data' events from the client, which provide moisture readings.
    call.on('data', function(request) {
      // Retrieve the moisture reading from the client's request.
      const inputMoisture = request.moisture_reading;

      // Calculate the recommended watering level based on the moisture reading.
        // This is a simplified formula, multiplying the input moisture by 1.5.
      const recommendedLevel = request.moisture_reading * 1.5; // Simplified logic

      // Write the calculated results back to the client.
        // The response includes both the original moisture reading for reference
        // and the calculated recommended watering level.
    call.write({
      input_moisture: inputMoisture, // Echo the input moisture for reference
      recommended_level: recommendedLevel // Send the calculated value
    });
  });
  // Listen for the 'end' event which indicates that the client has finished sending data.
  call.on('end', function() {
    // Properly close the server-side stream once all client data has been received.
    call.end();
  });
}

// Adding services to the gRPC server. Each service corresponds to a specific RPC method implementation.
server.addService(farmingProto.FarmService.service, {
  Calculate: calculateFertilizerRequirement, // Handle unary RPC for calculating fertilizer requirements.
  TemperatureStream: temperatureDataStream, // Handle server streaming RPC for temperature data.
  ComputeAverage: computeAverageSoilMoisture, // Handle client streaming RPC to compute average soil moisture.
  FindOptimum: findOptimum, // Handle bidirectional streaming RPC for finding optimum watering levels.
});

// Bind the server to a specific port and start listening for requests.
// '0.0.0.0' allows the server to accept connections on any IP address of the machine.
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    // Log an error message if the server fails to bind to the specified port.
    console.error(`Failed to bind server: ${err.message}`);
    return; // Stop further execution if there is a binding error.
  }
  // Start the server if the port binding is successful.
  //server.start();
  // Log that the server is running and show the port it's bound to for verification.
  console.log(`Server running at ${port}`);
});


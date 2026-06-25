#import "NitroArchiveZipEntryReader.h"
#import "minizip/mz_compat.h"

NSErrorDomain const NitroArchiveZipEntryReaderErrorDomain = @"NitroArchiveZipEntryReaderErrorDomain";

typedef NS_ENUM(NSInteger, NitroArchiveZipEntryReaderErrorCode) {
  NitroArchiveZipEntryReaderErrorOpenArchive = 1,
  NitroArchiveZipEntryReaderErrorEntryNotFound = 2,
  NitroArchiveZipEntryReaderErrorOpenEntry = 3,
  NitroArchiveZipEntryReaderErrorEntryTooLarge = 4,
  NitroArchiveZipEntryReaderErrorRead = 5,
  NitroArchiveZipEntryReaderErrorWrite = 6,
  NitroArchiveZipEntryReaderErrorChecksum = 7,
};

static void NitroArchiveSetError(NSError **error, NitroArchiveZipEntryReaderErrorCode code, NSString *message) {
  if (error == nil) {
    return;
  }
  *error = [NSError errorWithDomain:NitroArchiveZipEntryReaderErrorDomain
                               code:code
                           userInfo:@{NSLocalizedDescriptionKey: message}];
}

static BOOL NitroArchiveOpenCurrentEntry(unzFile zip, NSString *password, NSError **error) {
  int ret = password.length > 0
    ? unzOpenCurrentFilePassword(zip, [password cStringUsingEncoding:NSUTF8StringEncoding])
    : unzOpenCurrentFile(zip);
  if (ret != UNZ_OK) {
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorOpenEntry, @"Could not open ZIP entry");
    return NO;
  }
  return YES;
}

@implementation NitroArchiveZipEntryReader

+ (nullable NSData *)readEntryAtPath:(NSString *)archivePath
                            entryPath:(NSString *)entryPath
                             password:(nullable NSString *)password
                                limit:(uint64_t)limit
                                error:(NSError **)error {
  unzFile zip = unzOpen64(archivePath.fileSystemRepresentation);
  if (zip == NULL) {
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorOpenArchive, @"Could not open ZIP archive");
    return nil;
  }

  if (unzLocateFile(zip, [entryPath cStringUsingEncoding:NSUTF8StringEncoding], NULL) != UNZ_OK) {
    unzClose(zip);
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorEntryNotFound, @"Entry not found in ZIP archive");
    return nil;
  }
  if (!NitroArchiveOpenCurrentEntry(zip, password, error)) {
    unzClose(zip);
    return nil;
  }

  unz_file_info64 info = {};
  if (unzGetCurrentFileInfo64(zip, &info, NULL, 0, NULL, 0, NULL, 0) != UNZ_OK) {
    unzCloseCurrentFile(zip);
    unzClose(zip);
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorRead, @"Could not read ZIP entry metadata");
    return nil;
  }
  if (info.uncompressed_size > limit) {
    unzCloseCurrentFile(zip);
    unzClose(zip);
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorEntryTooLarge, @"ZIP entry exceeds read limit");
    return nil;
  }

  NSMutableData *data = [NSMutableData dataWithCapacity:(NSUInteger)MIN(info.uncompressed_size, (uint64_t)NSUIntegerMax)];
  uint8_t buffer[64 * 1024];
  uint64_t total = 0;
  int read = 0;
  while ((read = unzReadCurrentFile(zip, buffer, sizeof(buffer))) > 0) {
    total += (uint64_t)read;
    if (total > limit) {
      unzCloseCurrentFile(zip);
      unzClose(zip);
      NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorEntryTooLarge, @"ZIP entry exceeds read limit");
      return nil;
    }
    [data appendBytes:buffer length:(NSUInteger)read];
  }

  int closeRet = unzCloseCurrentFile(zip);
  unzClose(zip);
  if (read < 0) {
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorRead, @"Could not read ZIP entry");
    return nil;
  }
  if (closeRet != UNZ_OK) {
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorChecksum, @"ZIP entry checksum failed");
    return nil;
  }
  return data;
}

+ (BOOL)extractEntryAtPath:(NSString *)archivePath
                 entryPath:(NSString *)entryPath
            destinationPath:(NSString *)destinationPath
                  password:(nullable NSString *)password
                     limit:(uint64_t)limit
              writtenBytes:(uint64_t *)writtenBytes
                     error:(NSError **)error {
  unzFile zip = unzOpen64(archivePath.fileSystemRepresentation);
  if (zip == NULL) {
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorOpenArchive, @"Could not open ZIP archive");
    return NO;
  }

  if (unzLocateFile(zip, [entryPath cStringUsingEncoding:NSUTF8StringEncoding], NULL) != UNZ_OK) {
    unzClose(zip);
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorEntryNotFound, @"Entry not found in ZIP archive");
    return NO;
  }
  if (!NitroArchiveOpenCurrentEntry(zip, password, error)) {
    unzClose(zip);
    return NO;
  }

  unz_file_info64 info = {};
  if (unzGetCurrentFileInfo64(zip, &info, NULL, 0, NULL, 0, NULL, 0) != UNZ_OK) {
    unzCloseCurrentFile(zip);
    unzClose(zip);
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorRead, @"Could not read ZIP entry metadata");
    return NO;
  }
  if (info.uncompressed_size > limit) {
    unzCloseCurrentFile(zip);
    unzClose(zip);
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorEntryTooLarge, @"ZIP entry exceeds write limit");
    return NO;
  }

  FILE *file = fopen(destinationPath.fileSystemRepresentation, "wb");
  if (file == NULL) {
    unzCloseCurrentFile(zip);
    unzClose(zip);
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorWrite, @"Could not open destination file");
    return NO;
  }

  uint8_t buffer[64 * 1024];
  uint64_t total = 0;
  int read = 0;
  while ((read = unzReadCurrentFile(zip, buffer, sizeof(buffer))) > 0) {
    total += (uint64_t)read;
    if (total > limit || fwrite(buffer, 1, (size_t)read, file) != (size_t)read) {
      fclose(file);
      unzCloseCurrentFile(zip);
      unzClose(zip);
      NitroArchiveSetError(error, total > limit ? NitroArchiveZipEntryReaderErrorEntryTooLarge : NitroArchiveZipEntryReaderErrorWrite, total > limit ? @"ZIP entry exceeds write limit" : @"Could not write destination file");
      return NO;
    }
  }

  BOOL closeOK = fclose(file) == 0;
  int closeRet = unzCloseCurrentFile(zip);
  unzClose(zip);
  if (read < 0 || !closeOK) {
    NitroArchiveSetError(error, read < 0 ? NitroArchiveZipEntryReaderErrorRead : NitroArchiveZipEntryReaderErrorWrite, read < 0 ? @"Could not read ZIP entry" : @"Could not close destination file");
    return NO;
  }
  if (closeRet != UNZ_OK) {
    NitroArchiveSetError(error, NitroArchiveZipEntryReaderErrorChecksum, @"ZIP entry checksum failed");
    return NO;
  }

  if (writtenBytes != NULL) {
    *writtenBytes = total;
  }
  return YES;
}

@end

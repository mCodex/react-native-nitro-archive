#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

extern NSErrorDomain const NitroArchiveZipEntryReaderErrorDomain;

@interface NitroArchiveZipEntryReader : NSObject

+ (nullable NSData *)readEntryAtPath:(NSString *)archivePath
                            entryPath:(NSString *)entryPath
                             password:(nullable NSString *)password
                                limit:(uint64_t)limit
                                error:(NSError **)error;

+ (BOOL)extractEntryAtPath:(NSString *)archivePath
                 entryPath:(NSString *)entryPath
            destinationPath:(NSString *)destinationPath
                  password:(nullable NSString *)password
                     limit:(uint64_t)limit
              writtenBytes:(uint64_t *)writtenBytes
                     error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
